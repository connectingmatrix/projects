"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSubjectIds = resolveSubjectIds;
const giga_ai_helper_1 = require("giga-ai-helper");
const logger_1 = require("@gigav2/lib/logger");
const Subject_1 = require("@connectingmatrix/orm/entities/tree/Subject");
const TagEntity_1 = require("@connectingmatrix/orm/entities/TagEntity");
const SubjectTagEntity_1 = require("@connectingmatrix/orm/entities/SubjectTagEntity");
const logger = (0, logger_1.getScopedLogger)('agent-subject-filter-service');
function mergeUniqueSubjectIds(...collections) {
    return (0, giga_ai_helper_1.unique)(collections.flat());
}
function normalizeSlugList(slugs) {
    if (!(slugs === null || slugs === void 0 ? void 0 : slugs.length))
        return [];
    return (0, giga_ai_helper_1.unique)(slugs.map((slug) => slug.trim().toLowerCase()));
}
function hasAnyFilter(filter) {
    return Boolean((filter === null || filter === void 0 ? void 0 : filter.subjectId) ||
        ((filter === null || filter === void 0 ? void 0 : filter.subjectIds) && filter.subjectIds.length > 0) ||
        ((filter === null || filter === void 0 ? void 0 : filter.tagSlugs) && filter.tagSlugs.length > 0) ||
        ((filter === null || filter === void 0 ? void 0 : filter.subjectQuery) && filter.subjectQuery.trim()));
}
async function fetchSubjectsByExplicitIds(supabase, explicitIds) {
    if (!explicitIds.length)
        return [];
    const rows = await Subject_1.Subject.findByIds(explicitIds);
    return rows.map((row) => String(row.id || '')).filter(Boolean);
}
async function fetchTagIdsBySlugs(supabase, tagSlugs) {
    if (!tagSlugs.length)
        return [];
    return TagEntity_1.TagEntity.findIdsBySlugs(tagSlugs);
}
async function fetchSubjectIdsByTagIds(supabase, tagIds) {
    if (!tagIds.length)
        return [];
    const rows = await SubjectTagEntity_1.SubjectTagEntity.findSubjectIdsByTagIds(tagIds);
    return rows.map((row) => String(row.subject_id || '')).filter(Boolean);
}
async function searchSubjectIds(supabase, subjectQuery) {
    const query = (subjectQuery || '').trim();
    if (!query)
        return [];
    const rows = await Subject_1.Subject.searchIdsByQuery(query);
    return rows.map((row) => String(row.id || '')).filter(Boolean);
}
async function resolveSubjectIds(supabase, filter) {
    var _a;
    const startedAt = Date.now();
    const filterApplied = hasAnyFilter(filter);
    if (!filterApplied) {
        logger.debug('agent.subject_filter.skipped', { reason: 'no_filter' });
        return {
            subjectIds: null,
            filterApplied: false,
        };
    }
    const explicitIds = mergeUniqueSubjectIds([filter === null || filter === void 0 ? void 0 : filter.subjectId, ...((filter === null || filter === void 0 ? void 0 : filter.subjectIds) || [])]);
    const normalizedSlugs = normalizeSlugList(filter === null || filter === void 0 ? void 0 : filter.tagSlugs);
    // prettier-ignore
    logger.debug('agent.subject_filter.started', { explicit_ids_count: explicitIds.length, tag_slugs_count: normalizedSlugs.length, has_subject_query: Boolean((_a = filter === null || filter === void 0 ? void 0 : filter.subjectQuery) === null || _a === void 0 ? void 0 : _a.trim()), });
    try {
        const [matchedExplicit, tagIds, searchedSubjectIds] = await Promise.all([
            fetchSubjectsByExplicitIds(supabase, explicitIds),
            fetchTagIdsBySlugs(supabase, normalizedSlugs),
            searchSubjectIds(supabase, filter === null || filter === void 0 ? void 0 : filter.subjectQuery),
        ]);
        const subjectIdsFromTags = await fetchSubjectIdsByTagIds(supabase, tagIds);
        const subjectIds = mergeUniqueSubjectIds(matchedExplicit, subjectIdsFromTags, searchedSubjectIds);
        // prettier-ignore
        logger.info('agent.subject_filter.completed', { explicit_matches: matchedExplicit.length, tag_ids_count: tagIds.length, tag_subject_matches: subjectIdsFromTags.length, searched_subject_matches: searchedSubjectIds.length, resolved_subject_ids_count: subjectIds.length, duration_ms: Date.now() - startedAt, });
        return {
            subjectIds,
            filterApplied: true,
        };
    }
    catch (error) {
        logger.error('agent.subject_filter.failed', { duration_ms: Date.now() - startedAt, error: (0, logger_1.toErrorMeta)(error) });
        throw error;
    }
}
