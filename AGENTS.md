# Project Package

Contracts owned here:

- `AIAgentProjectEntity`: project metadata, source artifact manifest, runtime manifest, DB manifest, owner and organization scope.
- `createProjectSourceBundle`: creates a compressed source archive and excludes dependency folders, build outputs, caches, and archives.
- `storeProjectSourceBundle`: stores source archives through file-service artifact storage.
- `createProjectSourceUploadSession`: creates a resumable upload session for large source archives.

Project creation should prefer source artifacts over large inline file arrays when storage is configured.

Tree fetch performance rule:

- Explicit-root `fetchUserTree` requests must preserve their existing response unless the caller sends the optional direct-child paging flag. Only opt-in route loaders may page direct children inside the graph query for large roots such as GigaIntelligence.
