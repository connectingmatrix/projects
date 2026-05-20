import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = ['src/projects/source-bundle.ts', 'src/projects/index.ts'];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}
const entity = fs.readFileSync(path.join(root, '../giga-orm/src/entities/AIAgentProjectEntity.ts'), 'utf8');
for (const field of ['source_artifact', 'artifact_manifest']) {
  if (!entity.includes(field)) throw new Error(`Project entity is missing ${field}`);
}
const sourceBundle = fs.readFileSync(path.join(root, 'src/projects/source-bundle.ts'), 'utf8');
for (const token of ['storeProjectSourceBundle', 'createProjectSourceUploadSession', 'node_modules', 'application/zip']) {
  if (!sourceBundle.includes(token)) throw new Error(`Source bundle contract is missing ${token}`);
}
console.log('project contracts ok');
