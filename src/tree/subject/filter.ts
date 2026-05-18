import { unique } from 'giga-ai-helper';
import { ResolvedSubjectFilter, SubjectFilterInput } from '@gigav2/types/graphql.types';
import { getScopedLogger, toErrorMeta } from '@gigav2/lib/logger';
import { Subject } from '@gigav2/repositories/entities/tree/Subject';
import { TagEntity } from '@gigav2/repositories/entities/TagEntity';
import { SubjectTagEntity } from '@gigav2/repositories/entities/SubjectTagEntity';

const logger = getScopedLogger('agent-subject-filter-service');

function mergeUniqueSubjectIds(...collections: Array<Array<string | null | undefined>>) {
  return unique(collections.flat());
}

function normalizeSlugList(slugs?: string[]) {
  if (!slugs?.length) return [];
  return unique(slugs.map((slug) => slug.trim().toLowerCase()));
}

function hasAnyFilter(filter?: SubjectFilterInput) {
  return Boolean(
    filter?.subjectId ||
      (filter?.subjectIds && filter.subjectIds.length > 0) ||
      (filter?.tagSlugs && filter.tagSlugs.length > 0) ||
      (filter?.subjectQuery && filter.subjectQuery.trim()),
  );
}

async function fetchSubjectsByExplicitIds(supabase: any, explicitIds: string[]): Promise<string[]> {
  if (!explicitIds.length) return [];
  const rows = await Subject.findByIds(explicitIds);
  return rows.map((row) => String(row.id || '')).filter(Boolean);
}

async function fetchTagIdsBySlugs(supabase: any, tagSlugs: string[]): Promise<number[]> {
  if (!tagSlugs.length) return [];
  return TagEntity.findIdsBySlugs(tagSlugs);
}

async function fetchSubjectIdsByTagIds(supabase: any, tagIds: number[]): Promise<string[]> {
  if (!tagIds.length) return [];
  const rows = await SubjectTagEntity.findSubjectIdsByTagIds(tagIds);
  return rows.map((row) => String(row.subject_id || '')).filter(Boolean);
}

async function searchSubjectIds(supabase: any, subjectQuery?: string): Promise<string[]> {
  const query = (subjectQuery || '').trim();
  if (!query) return [];
  const rows = await Subject.searchIdsByQuery(query);
  return rows.map((row) => String(row.id || '')).filter(Boolean);
}

export async function resolveSubjectIds(supabase: any, filter?: SubjectFilterInput): Promise<ResolvedSubjectFilter> {
  const startedAt = Date.now();
  const filterApplied = hasAnyFilter(filter);
  if (!filterApplied) {
    logger.debug('agent.subject_filter.skipped', { reason: 'no_filter' });
    return {
      subjectIds: null,
      filterApplied: false,
    };
  }

  const explicitIds = mergeUniqueSubjectIds([filter?.subjectId, ...(filter?.subjectIds || [])]);
  const normalizedSlugs = normalizeSlugList(filter?.tagSlugs);

  // prettier-ignore
  logger.debug('agent.subject_filter.started', { explicit_ids_count: explicitIds.length, tag_slugs_count: normalizedSlugs.length, has_subject_query: Boolean(filter?.subjectQuery?.trim()), });

  try {
    const [matchedExplicit, tagIds, searchedSubjectIds] = await Promise.all([
      fetchSubjectsByExplicitIds(supabase, explicitIds),
      fetchTagIdsBySlugs(supabase, normalizedSlugs),
      searchSubjectIds(supabase, filter?.subjectQuery),
    ]);

    const subjectIdsFromTags = await fetchSubjectIdsByTagIds(supabase, tagIds);
    const subjectIds = mergeUniqueSubjectIds(matchedExplicit, subjectIdsFromTags, searchedSubjectIds);

    // prettier-ignore
    logger.info('agent.subject_filter.completed', { explicit_matches: matchedExplicit.length, tag_ids_count: tagIds.length, tag_subject_matches: subjectIdsFromTags.length, searched_subject_matches: searchedSubjectIds.length, resolved_subject_ids_count: subjectIds.length, duration_ms: Date.now() - startedAt, });

    return {
      subjectIds,
      filterApplied: true,
    };
  } catch (error) {
    logger.error('agent.subject_filter.failed', { duration_ms: Date.now() - startedAt, error: toErrorMeta(error) });
    throw error;
  }
}
