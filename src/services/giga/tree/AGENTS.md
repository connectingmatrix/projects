# Canonical Tree Service

- This directory owns Channels, Categories, Subjects, Posts CRUD, reads, linking, unlinking, and post subject reassignment.
- Domain-specific primitives live under `channel`, `category`, `subject`, and `post`.
- Domain entity classes live in `src/repositories/entities/tree`; this directory owns service orchestration and adapters.
- Shared infrastructure helpers live under `shared` (`read`, `resolve`, `scope`).
- Keep domain filenames camelCase.
- Prefer inheritance-based entities: graph-backed and row payload entities should define fields with decorators and rely on base `parse`/`extract`/`valid` behavior.
- Each domain folder exposes its Chat/MCP/Workflow action compatibility from its own `mcp.ts`.
- Root `mcp.ts` composes domain MCP compatibility plus fetch-tree compatibility.
- Do not add root-level `actions.ts`, `read.ts`, `resolve.ts`, `scope.ts`, `create.ts`, `update.ts`, `delete.ts`, `link.ts`, or `graphql.ts` facades.
- Chat and Workflow must read tree action names/catalogs from root `mcp.ts` so they stay aligned with MCP.
- Preserve hierarchy invariants: root creates channels only; categories live under channels/categories; subjects live under categories/subjects; posts live under subjects.
- `CONTAINS_CHANNEL`, `CONTAINS_CATEGORY`, and `CONTAINS_SUBJECT` mean owned hierarchy and must never be removed by shared-placement unlink actions.
- `LINKS` is the canonical relation for user-created shared/cross-tree placement; link/unlink must use only `LINKS`.
- Legacy `LINKS_CHANNEL` and `LINKS_CATEGORY` may appear only in migration/compatibility copy-forward code, never as new writes.
- `aiAttachSubjectToCategory` is the subject attach mutation and must create `CONTAINS_SUBJECT`.
- Subject shared-placement unlink must delete `LINKS` from category to subject and preserve `CONTAINS_SUBJECT` so subjects stay searchable through their owned hierarchy.
- Do not create root categories or root subjects.
- Keep Chat, Workflow, MCP, and GraphQL as adapters over GraphQL validation and the tree service/entity path.
- MCP must proxy GraphQL operations and present GraphQL errors; do not duplicate tree permission or business validation in MCP files.
- If a new tree action is added, update the relevant domain `mcp.ts` and the boundary tests.

## Entity Pattern Guardrails

- For each domain entity (`Channel`, `Category`, `Subject`, `Post`), keep one canonical create entrypoint only:
  - `create(input: DomainCreateInput)`
- Do not overload `create` with runtime/action signatures.
- Do not accept `unknown` in entity create methods.
- Do not shape-shift action payloads inside entity methods.
- Entity methods must consume typed, already-shaped input or throw.
- Adapter layers (`mcp.ts` / chat / workflow bridges) must:
  - validate input shape strictly
  - reject unknown keys
  - reject missing required keys
- call entity `create(input)` without mutating semantics.
- Adapters may map naming style only (snake_case to camelCase) but must not invent values.
- No fallback auto-fill for missing required fields (for example no implicit `userPermissionsId`, `scopeId`, `slug`, `name`).
- No entity-owned runtime convenience wrappers like `createAction` when equivalent validation can live in adapter bridges.
- No dual create flows (`create`, `createRecord`, `createXAction`) that duplicate behavior; wrappers may delegate only.
- Tree recursion (`Channel -> Category -> Subject -> Post`) must be relation-metadata-driven via `@FIELD({ type: 'relation', ... })`.
- `Post` recursion remains Supabase-only and must not introduce a Neo4j `Post` node/relation without an explicit design change.
