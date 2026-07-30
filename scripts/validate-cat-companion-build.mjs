import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const distRoot = path.join(projectRoot, 'dist');

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkFiles(entryPath);
      return entry.isFile() ? [entryPath] : [];
    }),
  );
  return files.flat();
};

const builtFiles = await walkFiles(distRoot);
const htmlFiles = builtFiles.filter((filePath) => filePath.endsWith('.html'));
if (htmlFiles.length === 0) {
  console.error('No built HTML files were found. Run the Astro build before this check.');
  process.exit(1);
}

const pageErrors = [];
for (const htmlPath of htmlFiles) {
  const html = await readFile(htmlPath, 'utf8');
  const mountCount = html.match(/<aside\b[^>]*\bdata-cat-companion(?:\s|=|>)/g)?.length ?? 0;
  if (mountCount !== 1) {
    pageErrors.push(`${path.relative(distRoot, htmlPath)} contains ${mountCount} cat companion mounts.`);
  }
  const liveRegionCount = html.match(/\bdata-pet-live(?:\s|=|>)/g)?.length ?? 0;
  if (liveRegionCount !== 1) {
    pageErrors.push(
      `${path.relative(distRoot, htmlPath)} contains ${liveRegionCount} cat companion live regions.`,
    );
  }
}

const dialoguePath = path.join(projectRoot, 'src', 'data', 'pet-lines.zh-CN.json');
const lines = JSON.parse(await readFile(dialoguePath, 'utf8'));
const petManifestPath = path.join(projectRoot, 'public', 'pet', 'cat-v1', 'manifest.json');
const petManifest = JSON.parse(await readFile(petManifestPath, 'utf8'));
const expectedTriggers = [
  'tab-return',
  'tab-return-long',
  'pet-head',
  'pet-nose',
  'rapid-click',
  'toy-start',
  'toy-end',
  'recall',
  'idle',
  'page-blog',
  'page-projects',
  'page-about',
];
const knownMoods = new Set([
  'neutral',
  'happy',
  'curious',
  'surprised',
  'relaxed',
  'playful',
  'sleepy',
  'annoyed',
]);

const dialogueErrors = [];
if (!Array.isArray(lines)) {
  dialogueErrors.push('The dialogue file must contain an array.');
} else {
  const ids = new Set();
  for (const [index, line] of lines.entries()) {
    if (!line || typeof line !== 'object') {
      dialogueErrors.push(`Dialogue entry ${index} is not an object.`);
      continue;
    }
    if (typeof line.id !== 'string' || line.id.length === 0 || ids.has(line.id)) {
      dialogueErrors.push(`Dialogue entry ${index} has a missing or duplicate id.`);
    }
    ids.add(line.id);
    if (!expectedTriggers.includes(line.trigger)) {
      dialogueErrors.push(`${line.id ?? `entry ${index}`} has an unknown trigger.`);
    }
    if (typeof line.text !== 'string' || line.text.trim().length === 0) {
      dialogueErrors.push(`${line.id ?? `entry ${index}`} has no dialogue text.`);
    }
    if (!knownMoods.has(line.mood)) {
      dialogueErrors.push(`${line.id ?? `entry ${index}`} has an unknown mood.`);
    }
    if (!Number.isFinite(line.weight) || line.weight <= 0) {
      dialogueErrors.push(`${line.id ?? `entry ${index}`} must have a positive weight.`);
    }
    if (!Number.isFinite(line.minIntervalMs) || line.minIntervalMs < 0) {
      dialogueErrors.push(`${line.id ?? `entry ${index}`} has an invalid minimum interval.`);
    }
    if (!Array.isArray(line.paths) || line.paths.length === 0) {
      dialogueErrors.push(`${line.id ?? `entry ${index}`} must target at least one path.`);
    }
  }

  for (const trigger of expectedTriggers) {
    const count = lines.filter((line) => line?.trigger === trigger).length;
    if (count < 4) dialogueErrors.push(`Trigger ${trigger} has only ${count} dialogue lines.`);
  }
}

const runtimePetFiles = new Set();
const collectRuntimePaths = (value) => {
  if (typeof value === 'string') {
    if (value.startsWith('/pet/cat-v1/runtime/')) runtimePetFiles.add(value.replace(/^\/+/, ''));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(collectRuntimePaths);
    return;
  }
  if (value && typeof value === 'object') Object.values(value).forEach(collectRuntimePaths);
};
collectRuntimePaths(petManifest.layers);
collectRuntimePaths(petManifest.walk?.frames);

const allowedPetFiles = new Set([
  'pet/cat-v1/manifest.json',
  'pet/cat-v1/README.md',
  ...runtimePetFiles,
]);
const deployedPetFiles = builtFiles
  .map((filePath) => path.relative(distRoot, filePath).split(path.sep).join('/'))
  .filter((relativePath) => relativePath.startsWith('pet/'));
const deploymentErrors = deployedPetFiles
  .filter((relativePath) => !allowedPetFiles.has(relativePath))
  .map((relativePath) => `Disallowed production or QA pet asset was deployed: ${relativePath}`);

const errors = [...pageErrors, ...dialogueErrors, ...deploymentErrors];
if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  console.error(`Cat companion build validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Cat companion build is complete on all ${htmlFiles.length} pages; ` +
    `${lines.length} dialogue lines passed validation.`,
);
