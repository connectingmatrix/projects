import { SupabaseClient } from '@supabase/supabase-js';
import { SubjectFilterInput } from '@gigav2/types/graphql.types';
import { resolveSubjectIds as resolveSubjectIdsFromFilter } from './filter';

export function resolveSubjectIds(supabase: SupabaseClient, filter?: SubjectFilterInput) {
  return resolveSubjectIdsFromFilter(supabase, filter);
}
