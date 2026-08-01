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
  const sizeContractCount = html.match(/\bdata-size-contract="172x258"/g)?.length ?? 0;
  if (sizeContractCount !== 1) {
    pageErrors.push(
      `${path.relative(distRoot, htmlPath)} must declare one 172x258 cat size contract.`,
    );
  }
}

const dialoguePath = path.join(projectRoot, 'src', 'data', 'pet-lines.zh-CN.json');
const lines = JSON.parse(await readFile(dialoguePath, 'utf8'));
const petStylesPath = path.join(projectRoot, 'src', 'styles', 'cat-companion.css');
const petStyles = await readFile(petStylesPath, 'utf8');
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

const requiredQuote =
  '对于一个温和而懦弱的灵魂，最大的不幸莫过于体验到了一次最大的幸福。';
if (!Array.isArray(lines) || !lines.some((line) => line?.text === requiredQuote)) {
  dialogueErrors.push('The required quoted idle line is missing.');
}
if (
  !petStyles.includes('width: var(--pet-asset-width, 172px);') ||
  !petStyles.includes('height: var(--pet-asset-height, 258px);')
) {
  dialogueErrors.push('The formal cat renderer must keep the unified 172x258 CSS size contract.');
}
if (petStyles.includes('--pet-asset-tablet-') || petStyles.includes('--pet-asset-mobile-')) {
  dialogueErrors.push('Breakpoint-specific formal cat size variables are not allowed.');
}

const coreRuntimePaths = [
  petManifest.layers?.shadow,
  petManifest.layers?.book,
  petManifest.layers?.tail,
  petManifest.layers?.body,
  petManifest.layers?.head,
  petManifest.layers?.earLeft,
  petManifest.layers?.earRight,
  petManifest.layers?.eyeBases?.left,
  petManifest.layers?.eyeBases?.right,
  petManifest.layers?.pupils?.left,
  petManifest.layers?.pupils?.right,
  petManifest.layers?.eyelids?.half?.left,
  petManifest.layers?.eyelids?.half?.right,
  petManifest.layers?.eyelids?.closed?.left,
  petManifest.layers?.eyelids?.closed?.right,
  petManifest.layers?.mouths?.closed,
  petManifest.layers?.mouths?.small,
  petManifest.layers?.mouths?.open,
  petManifest.layers?.mouths?.smile,
  petManifest.layers?.paw,
];
const runtimeUrls = [...coreRuntimePaths, ...(petManifest.walk?.frames ?? []), ...(petManifest.arrival?.frames ?? [])];
const runtimePetFiles = new Set(
  runtimeUrls
    .filter((value) => typeof value === 'string' && value.startsWith('/pet/cat-v1/runtime/'))
    .map((value) => value.replace(/^\/+/, '')),
);

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
if (runtimeUrls.length !== 38 || runtimePetFiles.size !== 38) {
  deploymentErrors.push(
    `The production pet whitelist must contain exactly 38 unique runtime files; got ${runtimePetFiles.size}.`,
  );
}
for (const requiredPath of runtimePetFiles) {
  if (!deployedPetFiles.includes(requiredPath)) {
    deploymentErrors.push(`Required production pet asset is missing from dist: ${requiredPath}`);
  }
}

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
