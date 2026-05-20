import { SupabaseClient } from '@supabase/supabase-js';
import { SubjectEntity } from '@connectingmatrix/orm/entities';
import { SubjectFilterInput } from '@gigav2/types/graphql.types';

export function resolveSubjectIds(supabase: SupabaseClient, filter?: SubjectFilterInput) {
  return SubjectEntity.resolveIds({
    supabase,
    subjectId: filter?.subjectId,
    subjectIds: filter?.subjectIds,
    tagSlugs: filter?.tagSlugs,
    subjectQuery: filter?.subjectQuery,
  });
}
