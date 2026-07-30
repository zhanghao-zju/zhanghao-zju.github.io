import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const publicRoot = path.join(projectRoot, 'public');
const runtimeRoot = path.join(publicRoot, 'pet', 'cat-v1', 'runtime');
const manifestPath = path.join(publicRoot, 'pet', 'cat-v1', 'manifest.json');
const requireReady = process.argv.includes('--require-ready');

const REQUIRED_SOURCE_CANVAS = { width: 1024, height: 1536 };
const REQUIRED_RUNTIME_CANVAS = { width: 384, height: 576 };
const REQUIRED_WALK_CANVAS = { width: 384, height: 512 };
const CORE_BUDGET_BYTES = 300 * 1024;
const PACKAGE_BUDGET_BYTES = 800 * 1024;

const errors = [];
const warnings = [];

const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNormalizedNumber = (value) => typeof value === 'number' && value >= 0 && value <= 1;
const isWithin = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};
const hasParentTraversal = (value) => value.split(/[\\/]+/).includes('..');

const get = (value, keys) => {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current) || !(key in current)) return undefined;
    current = current[key];
  }
  return current;
};

const layerFields = [
  ['body'],
  ['head'],
  ['earLeft'],
  ['earRight'],
  ['eyeBases', 'left'],
  ['eyeBases', 'right'],
  ['pupils', 'left'],
  ['pupils', 'right'],
  ['eyelids', 'half', 'left'],
  ['eyelids', 'half', 'right'],
  ['eyelids', 'closed', 'left'],
  ['eyelids', 'closed', 'right'],
  ['mouths', 'closed'],
  ['mouths', 'small'],
  ['mouths', 'open'],
  ['mouths', 'smile'],
  ['paw'],
  ['tail'],
  ['shadow'],
];

const WALK_FRAME_COUNT = 8;
const MIN_WALK_FRAME_DURATION_MS = 90;
const MAX_WALK_FRAME_DURATION_MS = 140;

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Pet asset validation failed: cannot read ${manifestPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!isRecord(manifest)) fail('manifest must contain a JSON object.');
if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1.');
if (typeof manifest.ready !== 'boolean') fail('ready must be a boolean.');
if (typeof manifest.characterId !== 'string' || manifest.characterId.length === 0) {
  fail('characterId must be a non-empty string.');
}

const canvasWidth = get(manifest, ['canvas', 'width']);
const canvasHeight = get(manifest, ['canvas', 'height']);
if (!isPositiveInteger(canvasWidth) || !isPositiveInteger(canvasHeight)) {
  fail('canvas.width and canvas.height must be positive integers.');
}
if (get(manifest, ['canvas', 'coordinateSpace']) !== 'top-left') {
  fail('canvas.coordinateSpace must be "top-left".');
}
if (
  canvasWidth !== REQUIRED_RUNTIME_CANVAS.width ||
  canvasHeight !== REQUIRED_RUNTIME_CANVAS.height
) {
  fail(
    `canvas must remain ${REQUIRED_RUNTIME_CANVAS.width}x${REQUIRED_RUNTIME_CANVAS.height} ` +
      'for the cat-v1 runtime contract.',
  );
}

const sourceCanvasWidth = get(manifest, ['source', 'canvas', 'width']);
const sourceCanvasHeight = get(manifest, ['source', 'canvas', 'height']);
if (!isPositiveInteger(sourceCanvasWidth) || !isPositiveInteger(sourceCanvasHeight)) {
  fail('source.canvas.width and source.canvas.height must be positive integers.');
}
if (get(manifest, ['source', 'canvas', 'coordinateSpace']) !== 'top-left') {
  fail('source.canvas.coordinateSpace must be "top-left".');
}
if (
  sourceCanvasWidth !== REQUIRED_SOURCE_CANVAS.width ||
  sourceCanvasHeight !== REQUIRED_SOURCE_CANVAS.height
) {
  fail(
    `source.canvas must remain ${REQUIRED_SOURCE_CANVAS.width}x${REQUIRED_SOURCE_CANVAS.height} ` +
      'for the preserved production-source contract.',
  );
}

const sourceCoreDirectory = get(manifest, ['source', 'coreDirectory']);
const sourceWalkDirectory = get(manifest, ['source', 'walk', 'directory']);
for (const [label, directory] of [
  ['source.coreDirectory', sourceCoreDirectory],
  ['source.walk.directory', sourceWalkDirectory],
]) {
  if (typeof directory !== 'string' || directory.length === 0) {
    fail(`${label} must be a non-empty project-relative directory.`);
    continue;
  }
  if (path.isAbsolute(directory) || directory.startsWith('/') || hasParentTraversal(directory)) {
    fail(`${label} must be repository-relative and must not contain "..": ${directory}`);
    continue;
  }
  const resolvedDirectory = path.resolve(projectRoot, directory);
  if (!isWithin(projectRoot, resolvedDirectory)) {
    fail(`${label} resolves outside the project: ${directory}`);
  }
}

const sourceWalkCanvasWidth = get(manifest, ['source', 'walk', 'canvas', 'width']);
const sourceWalkCanvasHeight = get(manifest, ['source', 'walk', 'canvas', 'height']);
if (!isPositiveInteger(sourceWalkCanvasWidth) || !isPositiveInteger(sourceWalkCanvasHeight)) {
  fail('source.walk.canvas.width and source.walk.canvas.height must be positive integers.');
}
if (get(manifest, ['source', 'walk', 'canvas', 'coordinateSpace']) !== 'top-left') {
  fail('source.walk.canvas.coordinateSpace must be "top-left".');
}
if (
  sourceWalkCanvasWidth !== REQUIRED_WALK_CANVAS.width ||
  sourceWalkCanvasHeight !== REQUIRED_WALK_CANVAS.height
) {
  fail(
    `source.walk.canvas must remain ${REQUIRED_WALK_CANVAS.width}x${REQUIRED_WALK_CANVAS.height}.`,
  );
}

for (const breakpoint of ['desktop', 'tablet', 'mobile']) {
  const width = get(manifest, ['displaySizes', breakpoint, 'width']);
  const height = get(manifest, ['displaySizes', breakpoint, 'height']);
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    fail(`displaySizes.${breakpoint} must have positive integer width and height.`);
    continue;
  }

  if (isPositiveInteger(canvasWidth) && isPositiveInteger(canvasHeight)) {
    const canvasRatio = canvasWidth / canvasHeight;
    const displayRatio = width / height;
    if (Math.abs(canvasRatio - displayRatio) / canvasRatio > 0.015) {
      fail(
        `displaySizes.${breakpoint} aspect ratio (${width}x${height}) does not match ` +
          `the ${canvasWidth}x${canvasHeight} canvas.`,
      );
    }
  }
}

if (get(manifest, ['anchors', 'units']) !== 'normalized') {
  fail('anchors.units must be "normalized".');
}
if (isRecord(manifest.anchors)) {
  for (const [name, anchor] of Object.entries(manifest.anchors)) {
    if (name === 'units') continue;
    if (!isRecord(anchor) || !isNormalizedNumber(anchor.x) || !isNormalizedNumber(anchor.y)) {
      fail(`anchors.${name} must contain normalized x and y values in the 0..1 range.`);
    }
  }
}

if (get(manifest, ['hitAreas', 'units']) !== 'normalized') {
  fail('hitAreas.units must be "normalized".');
}
if (isRecord(manifest.hitAreas)) {
  for (const [name, area] of Object.entries(manifest.hitAreas)) {
    if (name === 'units') continue;
    if (!isRecord(area) || !['circle', 'ellipse'].includes(area.shape)) {
      fail(`hitAreas.${name}.shape must be "circle" or "ellipse".`);
      continue;
    }
    for (const coordinate of ['cx', 'cy']) {
      if (!isNormalizedNumber(area[coordinate])) {
        fail(`hitAreas.${name}.${coordinate} must be in the 0..1 range.`);
      }
    }
    const radii = area.shape === 'circle' ? ['r'] : ['rx', 'ry'];
    for (const radius of radii) {
      if (!isNormalizedNumber(area[radius]) || area[radius] === 0) {
        fail(`hitAreas.${name}.${radius} must be greater than 0 and no more than 1.`);
      }
    }
  }
}

const layerEntries = [];
for (const keys of layerFields) {
  const source = get(manifest.layers, keys);
  const label = `layers.${keys.join('.')}`;
  if (
    typeof source !== 'string' ||
    !source.startsWith('/pet/cat-v1/runtime/') ||
    hasParentTraversal(source)
  ) {
    fail(`${label} must be a traversal-free /pet/cat-v1/runtime/ URL.`);
    continue;
  }
  if (path.extname(source).toLowerCase() !== '.webp') {
    fail(`${label} must reference an optimized WebP runtime asset.`);
  }
  layerEntries.push({ label, source });
}

const walkFrames = get(manifest, ['walk', 'frames']);
const walkEntries = [];
if (!Array.isArray(walkFrames) || walkFrames.length !== WALK_FRAME_COUNT) {
  fail(`walk.frames must contain exactly ${WALK_FRAME_COUNT} frame URLs.`);
} else {
  for (const [index, source] of walkFrames.entries()) {
    const label = `walk.frames[${index}]`;
    if (
      typeof source !== 'string' ||
      !source.startsWith('/pet/cat-v1/runtime/walk/') ||
      hasParentTraversal(source)
    ) {
      fail(`${label} must be a traversal-free /pet/cat-v1/runtime/walk/ URL.`);
      continue;
    }
    if (path.extname(source).toLowerCase() !== '.webp') {
      fail(`${label} must reference an optimized WebP runtime asset.`);
    }
    walkEntries.push({ label, source });
  }
}

const walkCanvasWidth = get(manifest, ['walk', 'canvas', 'width']);
const walkCanvasHeight = get(manifest, ['walk', 'canvas', 'height']);
if (!isPositiveInteger(walkCanvasWidth) || !isPositiveInteger(walkCanvasHeight)) {
  fail('walk.canvas.width and walk.canvas.height must be positive integers.');
}
if (get(manifest, ['walk', 'canvas', 'coordinateSpace']) !== 'top-left') {
  fail('walk.canvas.coordinateSpace must be "top-left".');
}
if (
  walkCanvasWidth !== REQUIRED_WALK_CANVAS.width ||
  walkCanvasHeight !== REQUIRED_WALK_CANVAS.height
) {
  fail(`walk.canvas must remain ${REQUIRED_WALK_CANVAS.width}x${REQUIRED_WALK_CANVAS.height}.`);
}

const walkFrameDurationMs = get(manifest, ['walk', 'frameDurationMs']);
if (
  !Number.isInteger(walkFrameDurationMs) ||
  walkFrameDurationMs < MIN_WALK_FRAME_DURATION_MS ||
  walkFrameDurationMs > MAX_WALK_FRAME_DURATION_MS
) {
  fail(
    `walk.frameDurationMs must be an integer between ${MIN_WALK_FRAME_DURATION_MS} and ` +
      `${MAX_WALK_FRAME_DURATION_MS}.`,
  );
}

const duplicateWalkSources = walkEntries.filter(
  ({ source }, index) => walkEntries.findIndex((entry) => entry.source === source) !== index,
);
for (const source of new Set(duplicateWalkSources.map((entry) => entry.source))) {
  fail(`walk.frames URLs must be unique; duplicate found: ${source}`);
}

const coreSources = new Set(layerEntries.map((entry) => entry.source));
for (const { label, source } of walkEntries) {
  if (coreSources.has(source)) fail(`${label} must not reuse a core layer URL: ${source}`);
}

const sourcePathForRuntime = (directory, runtimeSource) => {
  const sourceName = `${path.basename(runtimeSource, path.extname(runtimeSource))}.png`;
  return `${String(directory).replace(/\/$/, '')}/${sourceName}`;
};

const sourceCoreEntries =
  typeof sourceCoreDirectory === 'string'
    ? layerEntries.map(({ label, source }) => ({
        label: `source.${label}`,
        source: sourcePathForRuntime(sourceCoreDirectory, source),
      }))
    : [];
const sourceWalkEntries =
  typeof sourceWalkDirectory === 'string'
    ? walkEntries.map(({ label, source }) => ({
        label: `source.${label}`,
        source: sourcePathForRuntime(sourceWalkDirectory, source),
      }))
    : [];

const duplicateSources = layerEntries.filter(
  ({ source }, index) => layerEntries.findIndex((entry) => entry.source === source) !== index,
);
for (const source of new Set(duplicateSources.map((entry) => entry.source))) {
  fail(`Every core layer must use a unique runtime file; duplicate found: ${source}`);
}

const missingRuntimeCoreFiles = [];
const missingRuntimeWalkFiles = [];
const missingSourceCoreFiles = [];
const missingSourceWalkFiles = [];
let coreBytes = 0;
let walkBytes = 0;
const assetGroups = [
  {
    entries: layerEntries,
    expectedWidth: canvasWidth,
    expectedHeight: canvasHeight,
    format: 'webp',
    kind: 'runtime core layer',
    missing: missingRuntimeCoreFiles,
    budget: 'core',
    scope: 'runtime',
  },
  {
    entries: walkEntries,
    expectedWidth: walkCanvasWidth,
    expectedHeight: walkCanvasHeight,
    format: 'webp',
    kind: 'runtime walk frame',
    missing: missingRuntimeWalkFiles,
    budget: 'walk',
    scope: 'runtime',
  },
  {
    entries: sourceCoreEntries,
    expectedWidth: sourceCanvasWidth,
    expectedHeight: sourceCanvasHeight,
    format: 'png',
    kind: 'source core layer',
    missing: missingSourceCoreFiles,
    budget: null,
    scope: 'source',
  },
  {
    entries: sourceWalkEntries,
    expectedWidth: sourceWalkCanvasWidth,
    expectedHeight: sourceWalkCanvasHeight,
    format: 'png',
    kind: 'source walk frame',
    missing: missingSourceWalkFiles,
    budget: null,
    scope: 'source',
  },
];

const resolveAssetPath = (source) => {
  if (source.startsWith('/pet/cat-v1/runtime/')) {
    const resolved = path.resolve(publicRoot, source.replace(/^\/+/, ''));
    return isWithin(runtimeRoot, resolved) ? resolved : null;
  }
  if (path.isAbsolute(source) || source.startsWith('/') || hasParentTraversal(source)) return null;
  return path.resolve(projectRoot, source);
};

for (const group of assetGroups) {
  for (const { label, source } of group.entries) {
    const assetPath = resolveAssetPath(source);
    if (!assetPath || !assetPath.startsWith(`${projectRoot}${path.sep}`)) {
      fail(`${label} resolves outside the project: ${source}`);
      continue;
    }

    let assetStat;
    try {
      assetStat = await stat(assetPath);
    } catch {
      group.missing.push({ label, source });
      continue;
    }

    if (!assetStat.isFile()) {
      fail(`${label} is not a file: ${source}`);
      continue;
    }

    try {
      const canonicalPath = await realpath(assetPath);
      const allowedRoot = group.scope === 'runtime' ? runtimeRoot : projectRoot;
      if (!isWithin(allowedRoot, canonicalPath)) {
        fail(`${label} resolves through a symlink outside its allowed root: ${source}`);
        continue;
      }
    } catch {
      fail(`${label} cannot be resolved safely: ${source}`);
      continue;
    }

    if (group.budget === 'core') coreBytes += assetStat.size;
    if (group.budget === 'walk') walkBytes += assetStat.size;

    let metadata;
    let stats;
    try {
      const image = sharp(assetPath, { failOn: 'error', limitInputPixels: false });
      [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
    } catch {
      fail(`${label} must be a decodable ${group.format.toUpperCase()} image: ${source}`);
      continue;
    }

    const extension = path.extname(assetPath).slice(1).toLowerCase();
    if (extension !== group.format || metadata.format !== group.format) {
      fail(`${label} must be a real .${group.format} file: ${source}`);
    }
    if (metadata.width !== group.expectedWidth || metadata.height !== group.expectedHeight) {
      fail(
        `${label} is ${metadata.width}x${metadata.height}; every ${group.kind} must use ` +
          `${group.expectedWidth}x${group.expectedHeight}.`,
      );
    }
    if (!metadata.hasAlpha || !metadata.channels) {
      fail(`${label} must contain an alpha channel: ${source}`);
      continue;
    }

    const alpha = stats.channels[metadata.channels - 1];
    if (!alpha || alpha.max === 0) fail(`${label} is fully transparent: ${source}`);
    if (alpha && alpha.min === 255) fail(`${label} has no transparent canvas area: ${source}`);
  }
}

const missingFiles = [
  ...missingRuntimeCoreFiles,
  ...missingRuntimeWalkFiles,
  ...missingSourceCoreFiles,
  ...missingSourceWalkFiles,
];
if (manifest.ready && missingFiles.length > 0) {
  for (const { label, source } of missingFiles) fail(`${label} is missing: ${source}`);
}
if (requireReady && !manifest.ready) {
  fail('manifest.ready is false; the formal asset renderer is intentionally disabled.');
}
const packageBytes = coreBytes + walkBytes;
if (coreBytes > CORE_BUDGET_BYTES) {
  const message =
    `The 19 core layers total ${(coreBytes / 1024).toFixed(0)} KiB, exceeding the ` +
    '300 KiB first-visible asset limit.';
  if (manifest.ready || requireReady) fail(message);
  else warn(message);
}
if (packageBytes > PACKAGE_BUDGET_BYTES) {
  const message =
    `The full formal asset package is ${(packageBytes / 1024).toFixed(0)} KiB, above the ` +
    '800 KiB total limit.';
  if (manifest.ready || requireReady) fail(message);
  else warn(message);
}

for (const message of warnings) console.warn(`warning: ${message}`);

if (errors.length > 0) {
  for (const message of errors) console.error(`error: ${message}`);
  console.error(`Pet asset validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

if (!manifest.ready) {
  console.log(
    'Pet asset manifest is valid but remains in draft mode; missing ' +
      `${missingRuntimeCoreFiles.length}/${layerEntries.length} runtime core, ` +
      `${missingRuntimeWalkFiles.length}/${walkEntries.length} runtime walk, ` +
      `${missingSourceCoreFiles.length}/${sourceCoreEntries.length} source core, and ` +
      `${missingSourceWalkFiles.length}/${sourceWalkEntries.length} source walk files.`,
  );
} else {
  console.log(
    `Pet asset package is ready: ${layerEntries.length + walkEntries.length} runtime WebP files ` +
      `plus ${sourceCoreEntries.length + sourceWalkEntries.length} preserved PNG sources; ` +
      `${(packageBytes / 1024).toFixed(0)} KiB runtime total.`,
  );
}
