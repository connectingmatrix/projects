# Category Tree Service

- Category create and category-to-channel linking logic lives here.
- Domain entity class lives in `src/repositories/entities/tree/Category.ts` and uses decorator-defined fields.
- Keep exactly one canonical create method on the entity: `Category.create(input)`.
- Do not overload create with runtime or unknown payload signatures.
- Keep create behavior in the entity only. Any compatibility helper must delegate to `Category.create(input)` and contain zero business logic.
- Category Chat/MCP/Workflow capability exports live in `mcp.ts`.
- `mcp.ts` must validate create payload shape strictly and reject unknown/missing keys.
- `mcp.ts` may only map field naming; it must not infer required values.
- Nested category/subject creation must be relation-metadata-driven (`categories`, `subjects`) with strict fail-fast validation.
- `CONTAINS_CATEGORY` is owned hierarchy; category link/unlink must not remove it.
- Category-to-channel link/unlink writes must use canonical `LINKS`, not legacy `LINKS_CATEGORY`.
- Do not auto-generate nested id/slug or skip invalid children.
- Keep filenames camelCase.
- Categories may live under channels or categories, never directly at root.
- Do not add channel, subject, or post mutation logic in this folder.
