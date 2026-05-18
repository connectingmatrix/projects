import { fetchUserTree } from '@gigav2/services/giga/tree/fetchUserTree';
import { AgentActionRuntime } from '@gigav2/types/agent.types';
import { GigaActionOutput, emptyActionArtifacts } from './types';
import { optionalText, requireCapability } from './shared/resolve';

export async function runFetchUserTree(runtime: AgentActionRuntime, input: any): Promise<GigaActionOutput> {
  await requireCapability(runtime, 'CAN_READ_CHANNEL', 'channel read');
  const tree = await fetchUserTree(runtime.supabase, {
    userPermissionsId: runtime.userId,
    rootId: optionalText(input, 'root_id') || null,
    organizationId: optionalText(input, 'organization_id') || null,
  } as any);
  const count = (tree.user?.length || 0) + (tree.organization?.length || 0) + (tree.global?.length || 0);
  return { summary: `Fetched ${count} tree root(s).`, data: { tree }, ...emptyActionArtifacts };
}
