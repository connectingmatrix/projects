import { blendVectors, createEmbedding } from 'giga-ai-helper/embeddings';
import {
  extractYears,
  gatherStringValues,
  normalizeWhitespace,
  parseEmbeddingValue,
  toPgVector,
  toSlug,
  tryParseJson,
  uniqueTags,
} from 'giga-ai-helper';
import { EnvLoader } from '@gigav2/lib/env';
import { openai } from '@gigav2/services/common/openai-client';
import { SubjectTagEntity, TagEntity } from '@gigav2/repositories/entities';
import { Subject } from '@gigav2/repositories/entities/tree/Subject';
import type { TagCandidate } from '@gigav2/types/subject.types';

const DEFAULT_RESPONSE_MODEL = 'gpt-4.1-mini';
const MAX_TAGS = 20;
const MAX_SUMMARY_CHARS = 280;

const model = EnvLoader.get('OPENAI_MODEL') || DEFAULT_RESPONSE_MODEL;

async function extractTagNamesWithAI(context: string): Promise<string[]> {
  const input = normalizeWhitespace(context).slice(0, 8000);
  if (!input) return [];

  const response = await openai.responses.create({
    model,
    temperature: 0.1,
    instructions: [
      'Extract concise query tags from the provided context.',
      'Prioritize tags useful for filtering/search later.',
      'Focus on topic, location, year/date, organizations, sectors, and key entities.',
      'Respond strictly as JSON object: {"tags":["..."]}.',
      'Each tag should be short (1-4 words), no punctuation-heavy strings.',
      `Return at most ${MAX_TAGS} tags.`,
    ].join(' '),
    input,
  });

  const parsed = tryParseJson(response.output_text || '');
  if (parsed && typeof parsed === 'object') {
    const extracted = gatherStringValues((parsed as any).tags);
    if (extracted.length) return uniqueTags(extracted);
  }

  return [];
}

function extractFallbackTagNames(context: string): string[] {
  const normalized = normalizeWhitespace(context).slice(0, 4000);
  if (!normalized) return [];

  const yearTags = extractYears(normalized);

  const keywordTags = normalized
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 40);

  return uniqueTags([...yearTags, ...keywordTags]).slice(0, MAX_TAGS);
}

async function extractTagCandidates(context: string) {
  const aiTags = await extractTagNamesWithAI(context).catch(() => []);
  const fallbackTags = extractFallbackTagNames(context);
  const merged = uniqueTags([...aiTags, ...fallbackTags]).slice(0, MAX_TAGS);

  return merged.map((name) => ({ name, slug: toSlug(name) })).filter((tag) => tag.slug);
}

async function upsertTags(supabase: any, tags: TagCandidate[]): Promise<Array<{ id: number; name: string; slug: string }>> {
  if (!tags.length) return [];

  const slugs = tags.map((tag) => tag.slug);
  const existing = await TagEntity.findBySlugs(slugs);

  const existingBySlug = new Map<string, { id: number; name: string; slug: string }>();
  for (const row of existing || []) {
    if (!row?.slug) continue;
    existingBySlug.set(row.slug, row);
  }

  const missing = tags.filter((tag) => !existingBySlug.has(tag.slug));
  if (!missing.length) {
    return Array.from(existingBySlug.values());
  }

  const insertPayload = missing.map((tag) => ({
    name: tag.name,
    slug: tag.slug,
  }));

  try {
    for (const row of insertPayload) {
      await TagEntity.create({ name: row.name, slug: row.slug });
    }
  } catch (error: any) {
    if (error?.code !== '23505') throw error;
  }

  return TagEntity.findBySlugs(slugs);
}

async function attachTagsToSubject(supabase: any, subjectId: string, tags: Array<{ id: number }>) {
  if (!subjectId || !tags.length) return;

  const tagIds = tags.map((tag) => Number(tag.id)).filter((id) => Number.isFinite(id));
  if (!tagIds.length) return;

  const existing = await SubjectTagEntity.findBySubjectIdAndTagIds(subjectId, tagIds);

  const existingTagIds = new Set((existing || []).map((row) => Number(row.tag_id)));
  const rowsToInsert = tagIds
    .filter((tagId) => !existingTagIds.has(tagId))
    .map((tagId) => ({
      subject_id: subjectId,
      tag_id: tagId,
    }));

  if (!rowsToInsert.length) return;

  for (const row of rowsToInsert) {
    await SubjectTagEntity.create({ subject_id: row.subject_id, tag_id: row.tag_id });
  }
}

async function generatePostSummaryLine(post: { title?: string | null; narrative?: string | null; metadata?: Record<string, any> | null }) {
  const rawContext = normalizeWhitespace(
    [`Title: ${post.title || ''}`, `Narrative: ${post.narrative || ''}`, `Metadata: ${JSON.stringify(post.metadata || {})}`].join('\n'),
  ).slice(0, 6000);

  if (!rawContext) return '';

  const response = await openai.responses.create({
    model,
    temperature: 0.1,
    instructions: [
      'Write one concise sentence summary from the provided post context.',
      'Maximum 25 words.',
      'No bullet points and no extra commentary.',
      'Preserve concrete details like topic, location, timeframe when present.',
    ].join(' '),
    input: rawContext,
  });

  const summary = normalizeWhitespace(response.output_text || '');
  return summary.slice(0, MAX_SUMMARY_CHARS);
}

export async function enrichSubjectFromSubjectInfo(
  supabase: any,
  subject: {
    id: string;
    name?: string | null;
    description?: string | null;
    metadata?: Record<string, any> | null;
  },
) {
  if (!subject?.id) return { tags: [] as string[] };

  const context = [
    `Subject name: ${subject.name || ''}`,
    `Subject description: ${subject.description || ''}`,
    `Subject metadata: ${JSON.stringify(subject.metadata || {})}`,
  ].join('\n');

  const tagCandidates = await extractTagCandidates(context);
  if (!tagCandidates.length) {
    return { tags: [] as string[] };
  }

  const tags = await upsertTags(supabase, tagCandidates);
  await attachTagsToSubject(supabase, subject.id, tags);

  return {
    tags: tags.map((tag) => tag.slug),
  };
}

export async function enrichSubjectFromPost(
  supabase: any,
  input: {
    subjectId: string;
    postId: string;
    title?: string | null;
    narrative?: string | null;
    metadata?: Record<string, any> | null;
  },
) {
  if (!input.subjectId) return { tags: [] as string[], summary_line: '' };

  const subjectEntity = await Subject.single(input.subjectId);
  if (!subjectEntity) throw new Error('Subject not found for post enrichment.');
  const subject = subjectEntity.extract() as {
    id: string;
    name?: string | null;
    description?: string | null;
    summary?: unknown;
    metadata?: Record<string, unknown> | null;
  };

  const context = [
    `Subject name: ${subject.name || ''}`,
    `Subject description: ${subject.description || ''}`,
    `Post title: ${input.title || ''}`,
    `Post narrative: ${input.narrative || ''}`,
    `Post metadata: ${JSON.stringify(input.metadata || {})}`,
  ].join('\n');

  const tagCandidates = await extractTagCandidates(context);
  const tags = await upsertTags(supabase, tagCandidates);
  await attachTagsToSubject(supabase, subject.id, tags);

  const summaryLine = await generatePostSummaryLine({
    title: input.title,
    narrative: input.narrative,
    metadata: input.metadata,
  }).catch(() => normalizeWhitespace(`${input.title || ''}. ${input.narrative || ''}`));

  if (summaryLine) {
    const newEmbedding = await createEmbedding(summaryLine);
    const existingVector = parseEmbeddingValue(subject.summary);
    const existingCount = Number(subject.metadata?.summary_post_count || 0);
    const blended = blendVectors(existingVector, newEmbedding.vector, existingCount);
    const metadataObject = subject.metadata && typeof subject.metadata === 'object' ? subject.metadata : {};

    const nextMetadata = {
      ...metadataObject,
      summary_post_count: blended.count,
      summary_last_post_id: input.postId,
      summary_last_line: summaryLine,
      summary_updated_at: new Date().toISOString(),
    };

    await subjectEntity.update({ summary: toPgVector(blended.vector), metadata: nextMetadata });
  }

  return {
    tags: tags.map((tag) => tag.slug),
    summary_line: summaryLine,
  };
}
