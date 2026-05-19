import {
  artifactStoragePath,
  createArtifactUploadSession,
  createZipArtifactBody,
  putFileArtifact,
  type FileArtifactManifest,
  type FileResumableUploadSession,
  type FileStorageBody,
  type FileStorageProvider,
} from '@connectingmatrix/file-service/storage';

export type ProjectSourceFileInput = {
  path: string;
  body: FileStorageBody;
  mode?: number;
  date?: Date;
};

export type ProjectSourceBundle = {
  body: Buffer;
  files: string[];
  skipped: string[];
  bytes: number;
};

export type StoreProjectSourceBundleInput = {
  storage: FileStorageProvider;
  bucket: string;
  projectId: string;
  ownerId?: string | null;
  files: ProjectSourceFileInput[];
  metadata?: Record<string, unknown> | null;
};

export const PROJECT_SOURCE_EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  '.vite',
  'dist',
  'build',
  'coverage',
  '.cache',
  'tmp',
  'temp',
]);

export const PROJECT_SOURCE_EXCLUDED_SUFFIXES = [
  '.log',
  '.pid',
  '.sock',
  '.DS_Store',
  '.zip',
  '.tgz',
  '.tar',
  '.tar.gz',
  '.7z',
  '.rar',
];

const normalizePath = (value: string): string =>
  value
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');

export function shouldIncludeProjectSourcePath(value: string): boolean {
  const normalized = normalizePath(value);
  if (!normalized) return false;
  const parts = normalized.split('/');
  if (parts.some((part) => PROJECT_SOURCE_EXCLUDED_SEGMENTS.has(part))) return false;
  return !PROJECT_SOURCE_EXCLUDED_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export async function createProjectSourceBundle(files: ProjectSourceFileInput[], manifest: Record<string, unknown> = {}): Promise<ProjectSourceBundle> {
  const accepted: ProjectSourceFileInput[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const filePath = normalizePath(file.path);
    if (!shouldIncludeProjectSourcePath(filePath)) {
      skipped.push(file.path);
      continue;
    }
    accepted.push({ ...file, path: filePath });
  }

  const body = await createZipArtifactBody(accepted, {
    ...manifest,
    sourceBundle: true,
    excludedSegments: Array.from(PROJECT_SOURCE_EXCLUDED_SEGMENTS),
    skipped,
  });

  return { body, files: accepted.map((file) => file.path), skipped, bytes: body.byteLength };
}

export async function storeProjectSourceBundle(input: StoreProjectSourceBundleInput): Promise<FileArtifactManifest & { sourceFiles: string[]; skippedFiles: string[] }> {
  const bundle = await createProjectSourceBundle(input.files, {
    projectId: input.projectId,
    ownerId: input.ownerId || null,
    ...(input.metadata || {}),
  });
  const artifact = await putFileArtifact({
    storage: input.storage,
    bucket: input.bucket,
    body: bundle.body,
    filename: `${input.projectId}.source.zip`,
    kind: 'project-source',
    contentType: 'application/zip',
    ownerId: input.ownerId,
    projectId: input.projectId,
    metadata: {
      ...(input.metadata || {}),
      sourceFiles: bundle.files,
      skippedFiles: bundle.skipped,
    },
  });

  return { ...artifact, sourceFiles: bundle.files, skippedFiles: bundle.skipped };
}

export async function createProjectSourceUploadSession(input: {
  storage: FileStorageProvider;
  bucket: string;
  projectId: string;
  ownerId?: string | null;
  sizeBytes?: number | null;
  checksum?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<FileResumableUploadSession> {
  const path = artifactStoragePath({
    kind: 'project-source',
    ownerId: input.ownerId,
    projectId: input.projectId,
    filename: `${input.projectId}.source.zip`,
  });
  return createArtifactUploadSession({
    storage: input.storage,
    bucket: input.bucket,
    path,
    filename: `${input.projectId}.source.zip`,
    sizeBytes: input.sizeBytes,
    contentType: 'application/zip',
    checksum: input.checksum,
    metadata: { ...(input.metadata || {}), projectId: input.projectId, ownerId: input.ownerId || null },
  });
}
