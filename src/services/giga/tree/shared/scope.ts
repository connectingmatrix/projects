type TreeScopeNode =
  | Record<string, unknown>
  | {
      organizationId?: string | null;
      createdBy?: string | null;
      isGlobal?: boolean | null;
    }
  | null
  | undefined;

export type TreeScope = {
  organizationId: string | null;
  createdBy: string | null;
  isGlobal: boolean;
};

export function readTreeScope(node: TreeScopeNode): TreeScope {
  return {
    organizationId: String(node?.organizationId || '').trim() || null,
    createdBy: String(node?.createdBy || '').trim() || null,
    isGlobal: node?.isGlobal === true,
  };
}

export function sameTreeScope(leftNode: TreeScopeNode, rightNode: TreeScopeNode): boolean {
  const left = readTreeScope(leftNode);
  const right = readTreeScope(rightNode);

  if (left.organizationId || right.organizationId) {
    return left.organizationId === right.organizationId;
  }

  if (left.isGlobal || right.isGlobal) {
    return left.isGlobal === right.isGlobal;
  }

  return left.createdBy === right.createdBy;
}
