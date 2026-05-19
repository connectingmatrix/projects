# Project Package

Contracts owned here:

- `AIAgentProjectEntity`: project metadata, source artifact manifest, runtime manifest, DB manifest, owner and organization scope.
- `createProjectSourceBundle`: creates a compressed source archive and excludes dependency folders, build outputs, caches, and archives.
- `storeProjectSourceBundle`: stores source archives through file-service artifact storage.
- `createProjectSourceUploadSession`: creates a resumable upload session for large source archives.

Project creation should prefer source artifacts over large inline file arrays when storage is configured.
