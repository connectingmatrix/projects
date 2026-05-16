# AI Agent Projects

Service helpers for AI Agent project files, database consoles, DB viewer launch payloads, builds, deployments, workspace manifests, and process monitoring.

## Rules

- Project files are mirrored into the kube-mounted User Drive or Organisation Drive workspace.
- File paths must remain inside the project workspace.
- File-driven databases are allowed under the project drive workspace: SQLite, DuckDB, Kuzu/graph files, JSON/document DB files, LowDB/Loki JSON, PGlite, RxDB, and generic file-database manifests.
- External databases must be represented as verified external connections. Secrets stay in the credentials vault and are not stored in the project metadata.
- `aiAgentProjectVerifyExternalDatabase` checks external host/port reachability and returns `file_database` for drive-local databases.
- `aiAgentProjectLaunchDatabaseViewer` returns a launch URL for an externally deployed DB viewer. Do not vendor DBeaver or CloudBeaver code into this repo.
- Project build/deploy actions register runtime monitor processes with `AI_AGENT_PROJECT` scope and broadcast realtime process events with process ID, user ID, parent scope ID, scope type, CPU, and RAM fields.
