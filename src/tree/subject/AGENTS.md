# Subject Tree Service

- Subject record creation, graph attachment, category attach, and removal logic lives here.
- Domain entity lives in `src/repositories/entities/tree/Subject.ts`; this folder owns subject service adapters.
- Keep exactly one canonical create method on the entity: `SubjectEntity.create(input)`.
- Do not overload create with runtime or unknown payload signatures.
- Keep create behavior in the entity only. Any helper (`createRecord` etc.) must delegate and not add alternative rules.
- Subject Chat/MCP/Workflow capability exports live in `mcp.ts`.
- `mcp.ts` must validate create payload shape strictly and reject unknown/missing keys.
- `mcp.ts` may only map naming style; it must not fabricate missing required fields.
- Nested subject/post creation must be relation-metadata-driven (`subjects`, `posts`) and strict fail-fast.
- `CONTAINS_SUBJECT` is owned hierarchy and must never be removed by subject shared-placement unlink.
- `aiAttachSubjectToCategory` is the subject attach mutation and must create `CONTAINS_SUBJECT`.
- Subject shared-placement writes use canonical `LINKS`; shared unlink removes only category-to-subject `LINKS`.
- `Post` remains Supabase-only in this tree stack; nested post handling sets explicit `subject_id` from parent subject context.
- Keep filenames camelCase.
- Subjects may live under categories or subjects, never directly at root.
- Do not add channel, category, or post mutation logic in this folder.
