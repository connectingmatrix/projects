# Channel Tree Service

- Channel create, link, move, and graph write logic lives here.
- Domain entity class lives in `src/repositories/entities/tree/Channel.ts` and uses decorator-defined fields.
- Keep exactly one canonical create method on the entity: `Channel.create(input)`.
- Do not overload create with runtime or unknown payload signatures.
- Channel Chat/MCP/Workflow capability exports live in `mcp.ts`.
- `mcp.ts` must validate create payload shape strictly and reject unknown/missing keys.
- Nested tree creation under channel must come from relation metadata fields (`@FIELD({ type: 'relation', ... })`), not ad-hoc parser helpers.
- `CONTAINS_CHANNEL` is owned hierarchy; link/unlink must not remove it.
- Channel link/unlink writes must use canonical `LINKS`, not legacy `LINKS_CHANNEL`.
- No create-time autofills for nested category payloads (no implicit id/slug/name inference).
- Keep filenames camelCase.
- Do not add category, subject, or post mutation logic in this folder.
- Root-level tree creates must create channels only.
