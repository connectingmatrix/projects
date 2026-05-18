# Post Tree Service

- Post record creation, post read helpers, and post action execution live here.
- Domain payload entity lives in `src/repositories/entities/tree/Post.ts` and uses decorator-defined fields.
- Keep exactly one canonical create method on the entity path: `Post.create(input)`.
- Do not overload create with runtime or unknown payload signatures.
- Keep create behavior in the entity only. Any helper (`createRecord` etc.) must delegate and not redefine create rules.
- Post Chat/MCP/Workflow capability exports live in `mcp.ts`.
- `mcp.ts` must validate create payload shape strictly and reject unknown/missing keys.
- `mcp.ts` may only map naming style; it must not invent values for required keys.
- Keep filenames camelCase.
- Posts must stay under subjects; post linking means subject reassignment.
- Posts remain Supabase-only under subjects; do not add Neo4j post nodes or link relations.
- Do not add channel, category, or subject graph mutation logic in this folder.
