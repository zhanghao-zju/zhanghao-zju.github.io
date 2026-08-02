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
  const sizeModeCount = html.match(/\bdata-size-mode="normal"/g)?.length ?? 0;
  const giantButtonCount = html.match(/\bdata-pet-action="giant"/g)?.length ?? 0;
  if (sizeModeCount !== 1 || giantButtonCount !== 1) {
    pageErrors.push(
      `${path.relative(distRoot, htmlPath)} must declare normal size mode and one giant toggle.`,
    );
  }
  if (!/data-pet-action="giant"[^>]*aria-label="进入巨大模式"[^>]*aria-pressed="false"/.test(html)) {
    pageErrors.push(
      `${path.relative(distRoot, htmlPath)} giant toggle is missing its initial accessible state.`,
    );
  }
}

const dialoguePath = path.join(projectRoot, 'src', 'data', 'pet-lines.zh-CN.json');
const lines = JSON.parse(await readFile(dialoguePath, 'utf8'));
const petStylesPath = path.join(projectRoot, 'src', 'styles', 'cat-companion.css');
const petStyles = await readFile(petStylesPath, 'utf8');
const petControllerPath = path.join(projectRoot, 'src', 'scripts', 'cat-companion', 'controller.ts');
const petController = await readFile(petControllerPath, 'utf8');
const petGazePath = path.join(projectRoot, 'src', 'scripts', 'cat-companion', 'gaze.ts');
const petGaze = await readFile(petGazePath, 'utf8');
const petStoragePath = path.join(projectRoot, 'src', 'scripts', 'cat-companion', 'storage.ts');
const petStorage = await readFile(petStoragePath, 'utf8');
const petManifestPath = path.join(projectRoot, 'public', 'pet', 'cat-v1', 'manifest.json');
const petManifest = JSON.parse(await readFile(petManifestPath, 'utf8'));
const expectedTriggers = [
  'first-visit',
  'tab-return',
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

  const introductionLines = lines.filter((line) => line?.trigger === 'first-visit');
  if (introductionLines.length !== 1) {
    dialogueErrors.push('The first-visit trigger must contain exactly one introduction line.');
  }
  const interactiveTriggers = new Set([
    'tab-return',
    'pet-head',
    'pet-nose',
    'rapid-click',
    'toy-start',
    'toy-end',
    'recall',
  ]);
  const interactiveCount = lines.filter((line) => interactiveTriggers.has(line?.trigger)).length;
  if (interactiveCount > 10) {
    dialogueErrors.push(`Interactive dialogue must contain at most 10 lines; found ${interactiveCount}.`);
  }
}

const requiredQuote =
  '你好，我叫长毛，是一只长毛小狸花。';
if (!Array.isArray(lines) || !lines.some((line) => line?.text === requiredQuote)) {
  dialogueErrors.push('The required quoted idle line is missing.');
}
if (
  !petStyles.includes('width: var(--pet-asset-width, 172px);') ||
  !petStyles.includes('height: var(--pet-asset-height, 258px);')
) {
  dialogueErrors.push('The formal cat renderer must keep the unified 172x258 CSS size contract.');
}
const baseCharacterRule =
  petStyles.match(/\[data-pet-character\]\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? '';
if (
  !baseCharacterRule.includes('left: calc((220px - var(--pet-asset-width, 172px)) / 2);') ||
  !baseCharacterRule.includes('width: var(--pet-asset-width, 172px);') ||
  !baseCharacterRule.includes('height: var(--pet-asset-height, 258px);') ||
  /\bwidth:\s*190px|\bheight:\s*216px/.test(baseCharacterRule)
) {
  dialogueErrors.push(
    'Base, fallback, loading, walk, arrival and asset renderers must share one 172x258 character box.',
  );
}
if (petStyles.includes('--pet-asset-tablet-') || petStyles.includes('--pet-asset-mobile-')) {
  dialogueErrors.push('Breakpoint-specific formal cat size variables are not allowed.');
}

const integrationContracts = [
  [petController, 'const MAX_GIANT_SCALE = 3;', 'Giant mode must cap desktop scaling at 3x.'],
  [petController, 'const GIANT_MOTION_GUTTER = 12;', 'Giant contain sizing must reserve room for ambient motion.'],
  [petController, 'this.#root.dataset.sizeMode = this.#sizeMode;', 'Giant mode must expose its data state.'],
  [petController, "giant ? '退出巨大模式' : '进入巨大模式'", 'The giant toggle label must update dynamically.'],
  [petController, 'readPetPosition(this.#sizeMode)', 'Normal and giant positions must restore independently.'],
  [petController, 'writePetPosition({ x: bounds.left, y: bounds.top }, this.#sizeMode)', 'Dragging must persist the active mode position.'],
  [petController, "this.#root.dataset.tocOpen === 'true'", 'The giant toggle must respect mobile TOC mutual exclusion.'],
  [petController, 'this.#root.dataset.arrivalPhase', 'The giant toggle must be unavailable during arrival.'],
  [petController, 'this.#giantButton.disabled = true;', 'Arrival must disable the giant toggle.'],
  [petController, 'this.#giantButton.disabled = false;', 'Arrival completion must restore the giant toggle.'],
  [petController, "this.#bubble.dataset.bubbleSide = 'center';", 'Speech bubbles must be horizontally centered on the cat.'],
  [petController, "const vertical = aboveTop >= viewport.top ? 'above' : 'below';", 'Speech bubbles may move below only when top space is unavailable.'],
  [petStorage, 'cat-companion:v1:giant-position', 'Giant position must use an independent session key.'],
  [petStorage, 'cat-companion:v1:size-mode', 'Size mode must persist for the session.'],
  [petStyles, '[data-cat-companion][data-size-mode="giant"]', 'Giant mode must have an explicit CSS state.'],
  [petStyles, 'transform: scale(var(--pet-scale));', 'Character scaling must keep the 172x258 layout contract.'],
  [petStyles, '--pet-bubble-arrow-x', 'The centered bubble arrow must point at the cat after clamping.'],
  [petStyles, ':not([data-hidden="true"]):not([data-toc-open="true"])', 'Hidden and TOC states must suppress the giant toolbar.'],
  [petStyles, 'var(--pet-toolbar-top', 'The giant exit toolbar must stay inside the visual viewport.'],
  [petStyles, '.article-toc-mobile > summary', 'The mobile article TOC trigger must remain reachable over a giant cat.'],
  [petGaze, '--pet-body-follow-turn', 'Gaze must expose a subtle body rotation follow value.'],
  [petGaze, '--pet-body-follow-lift', 'Gaze must expose a subtle body lift follow value.'],
  [petStyles, 'transform-origin: 50% 82%;', 'Body follow must pivot near the planted feet.'],
  [petStyles, 'cat-companion-body-pat-follow', 'Head pat reactions must coordinate the body.'],
  [petStyles, 'cat-companion-body-nose-follow', 'Nose reactions must coordinate the body.'],
  [petStyles, 'cat-companion-body-rapid-follow', 'Rapid reactions must coordinate the body.'],
];
for (const [source, snippet, message] of integrationContracts) {
  if (!source.includes(snippet)) dialogueErrors.push(message);
}
if (!/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-pet-character\][\s\S]*?transform: scale\(var\(--pet-scale\)\)/.test(petStyles)) {
  dialogueErrors.push('Reduced motion must retain the selected normal or giant scale.');
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
