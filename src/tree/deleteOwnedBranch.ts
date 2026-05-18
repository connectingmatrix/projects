import { SupabaseClient } from '@supabase/supabase-js';
import { invariant } from '@gigav2/lib/helper';
import { AIPostsRepository } from '@gigav2/repositories/ai-posts.repository';
import { AISubjectsRepository } from '@gigav2/repositories/ai-subjects.repository';
import { TreeGraphEntity } from '@gigav2/services/giga/tree/system';
import { GRAPH_LABELS } from '@gigav2/types/graph.types';
import type { BranchNodeRecord, DeletableRootType, DeleteBranchPayload, OwnershipRecord } from '@gigav2/types/graphql.types';

const ROOT_LABEL_BY_TYPE = {
  channel: GRAPH_LABELS.channel,
  category: GRAPH_LABELS.category,
} as const;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function deleteOwnedBranch(
  supabase: SupabaseClient,
  input: {
    rootType: DeletableRootType;
    rootId: string;
    userPermissionsId: string;
  },
): Promise<DeleteBranchPayload> {
  invariant(Boolean(input.userPermissionsId), 'userPermissionsId is required to delete a branch.');
  invariant(Boolean(input.rootId), `${input.rootType} id is required.`);

  const rootLabel = ROOT_LABEL_BY_TYPE[input.rootType];
  const ownership = (await TreeGraphEntity.readOwnedBranchRoot({
    rootLabel,
    rootId: input.rootId,
    userPermissionsId: input.userPermissionsId,
  })) as Omit<OwnershipRecord, 'owns'> & { owns?: boolean };
  if (!ownership?.exists) {
    return {
      deleted: false,
      deletedNodeCount: 0,
      deletedSubjectCount: 0,
      deletedPostCount: 0,
    };
  }

  if (!ownership.organizationId && ownership.owns !== true) {
    ownership.owns = await TreeGraphEntity.readInheritedBranchOwnership({
      rootLabel,
      rootId: input.rootId,
      userPermissionsId: input.userPermissionsId,
    });
  }

  invariant(ownership.owns || Boolean(ownership.organizationId), `You do not own this ${input.rootType}, so it cannot be deleted.`);

  const branchNodes = (await TreeGraphEntity.listBranchNodes({ rootLabel, rootId: input.rootId })) as BranchNodeRecord[];
  const subjectIds = unique(
    branchNodes
      .filter((node) => list(node.labels).includes(GRAPH_LABELS.subjectRef))
      .map((node) => {
        if (typeof node.supabaseId === 'string' && node.supabaseId.trim()) {
          return node.supabaseId.trim();
        }
        return node.id;
      }),
  );

  const postsRepository = new AIPostsRepository(supabase as any);
  const subjectsRepository = new AISubjectsRepository(supabase as any);
  const posts = await postsRepository.getBySubjectIds(subjectIds);
  const postIds = unique(posts.map((post) => post.id).filter((value): value is string => typeof value === 'string' && value.trim().length > 0));

  const [deletedPostCount, deletedSubjectCount] = await Promise.all([
    postsRepository.deleteByIds(postIds),
    subjectsRepository.deleteByIds(subjectIds),
  ]);

  return {
    deleted: true,
    deletedNodeCount: await TreeGraphEntity.deleteBranchNodes({ rootLabel, rootId: input.rootId }),
    deletedSubjectCount,
    deletedPostCount,
  };
}

function list<T>(value?: T[] | null): T[] {
  return Array.isArray(value) ? value : [];
}

export async function deleteAiChannelBranch(
  supabase: SupabaseClient,
  input: { channelId: string; userPermissionsId: string },
): Promise<DeleteBranchPayload> {
  return deleteOwnedBranch(supabase, {
    rootType: 'channel',
    rootId: input.channelId,
    userPermissionsId: input.userPermissionsId,
  });
}

export async function deleteAiCategoryBranch(
  supabase: SupabaseClient,
  input: { categoryId: string; userPermissionsId: string },
): Promise<DeleteBranchPayload> {
  return deleteOwnedBranch(supabase, {
    rootType: 'category',
    rootId: input.categoryId,
    userPermissionsId: input.userPermissionsId,
  });
}
