import { mkdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const publicRoot = path.join(projectRoot, 'public');
const runtimeRoot = path.join(publicRoot, 'pet', 'cat-v1', 'runtime');
const manifestPath = path.join(publicRoot, 'pet', 'cat-v1', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const REQUIRED_SOURCE_CANVAS = { width: 1024, height: 1536 };
const REQUIRED_RUNTIME_CANVAS = { width: 384, height: 576 };
const REQUIRED_WALK_CANVAS = { width: 384, height: 512 };
const REQUIRED_ARRIVAL_CANVAS = { width: 384, height: 576 };

const layerFields = [
  ['shadow'],
  ['book'],
  ['tail'],
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
];

const get = (value, keys) => keys.reduce((current, key) => current?.[key], value);
const isWithin = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};
const hasParentTraversal = (value) => value.split(/[\\/]+/).includes('..');
const resolveProjectAsset = (source) => {
  if (
    typeof source !== 'string' ||
    source.length === 0 ||
    path.isAbsolute(source) ||
    source.startsWith('/') ||
    hasParentTraversal(source)
  ) {
    throw new Error(`Source path must be repository-relative and contain no "..": ${source}`);
  }
  const resolved = path.resolve(projectRoot, source);
  if (!isWithin(projectRoot, resolved)) {
    throw new Error(`Source path resolves outside the project: ${source}`);
  }
  return resolved;
};
const resolveRuntimeAsset = (source) => {
  if (
    typeof source !== 'string' ||
    !source.startsWith('/pet/cat-v1/runtime/') ||
    hasParentTraversal(source)
  ) {
    throw new Error(`Runtime path must be a traversal-free /pet/cat-v1/runtime/ URL: ${source}`);
  }
  const resolved = path.resolve(publicRoot, source.replace(/^\/+/, ''));
  if (!isWithin(runtimeRoot, resolved)) {
    throw new Error(`Runtime path resolves outside the cat runtime directory: ${source}`);
  }
  return resolved;
};
const sourceForRuntime = (directory, runtimeSource) =>
  `${directory.replace(/\/$/, '')}/${path.basename(runtimeSource, path.extname(runtimeSource))}.png`;

const assertSource = async (sourcePath, width, height) => {
  const canonicalPath = await realpath(sourcePath);
  if (!isWithin(projectRoot, canonicalPath)) {
    throw new Error(`${sourcePath} resolves through a symlink outside the repository`);
  }
  const image = sharp(sourcePath, { failOn: 'error', limitInputPixels: false });
  const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
  if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height) {
    throw new Error(
      `${sourcePath} must be a ${width}x${height} PNG; got ` +
        `${metadata.format ?? 'unknown'} ${metadata.width ?? '?'}x${metadata.height ?? '?'}`,
    );
  }
  if (!metadata.hasAlpha || !metadata.channels) throw new Error(`${sourcePath} has no alpha channel`);
  const alpha = stats.channels[metadata.channels - 1];
  if (!alpha || alpha.max === 0) throw new Error(`${sourcePath} is fully transparent`);
  if (alpha.min === 255) throw new Error(`${sourcePath} has no transparent canvas area`);
};

const convert = async ({ source, destination, width, height, resize, lossless, quality = 88 }) => {
  await assertSource(source, resize.sourceWidth, resize.sourceHeight);
  await mkdir(path.dirname(destination), { recursive: true });
  const canonicalDestinationDirectory = await realpath(path.dirname(destination));
  if (!isWithin(runtimeRoot, canonicalDestinationDirectory) && canonicalDestinationDirectory !== runtimeRoot) {
    throw new Error(`${destination} resolves through a directory outside the runtime root`);
  }
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.tmp`);
  await rm(temporary, { force: true });

  let pipeline = sharp(source, { failOn: 'error', limitInputPixels: false });
  if (resize.enabled) {
    pipeline = pipeline.resize(width, height, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });
  }
  pipeline = pipeline.toColourspace('srgb');
  pipeline = lossless
    ? pipeline.webp({ lossless: true, effort: 6 })
    : pipeline.webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true });

  await pipeline.toFile(temporary);
  await rename(temporary, destination);

  const metadata = await sharp(destination, { failOn: 'error' }).metadata();
  if (
    metadata.format !== 'webp' ||
    metadata.width !== width ||
    metadata.height !== height ||
    !metadata.hasAlpha
  ) {
    throw new Error(`Runtime verification failed for ${destination}`);
  }
  return (await stat(destination)).size;
};

if (manifest.ready && !process.argv.includes('--force')) {
  throw new Error('Refusing to replace an enabled runtime. Set ready=false or pass --force.');
}

const assertCanvas = (label, canvas, expected) => {
  if (
    canvas?.width !== expected.width ||
    canvas?.height !== expected.height ||
    canvas?.coordinateSpace !== 'top-left'
  ) {
    throw new Error(`${label} must be ${expected.width}x${expected.height} with a top-left origin`);
  }
};

assertCanvas('source.canvas', manifest.source?.canvas, REQUIRED_SOURCE_CANVAS);
assertCanvas('canvas', manifest.canvas, REQUIRED_RUNTIME_CANVAS);
assertCanvas('source.walk.canvas', manifest.source?.walk?.canvas, REQUIRED_WALK_CANVAS);
assertCanvas('walk.canvas', manifest.walk?.canvas, REQUIRED_WALK_CANVAS);
assertCanvas('source.arrival.canvas', manifest.source?.arrival?.canvas, REQUIRED_ARRIVAL_CANVAS);
assertCanvas('arrival.canvas', manifest.arrival?.canvas, REQUIRED_ARRIVAL_CANVAS);
resolveProjectAsset(manifest.source?.coreDirectory);
resolveProjectAsset(manifest.source?.walk?.directory);
resolveProjectAsset(manifest.source?.arrival?.directory);

const runtimeCoreEntries = layerFields.map((keys) => ({
  key: keys.join('.'),
  runtime: get(manifest.layers, keys),
}));
const runtimeWalkEntries = manifest.walk.frames.map((runtime, index) => ({
  key: `walk-${String(index + 1).padStart(2, '0')}`,
  runtime,
}));
const runtimeArrivalEntries = manifest.arrival.frames.map((runtime, index) => ({
  key: `arrival-${String(index + 1).padStart(2, '0')}`,
  index,
  runtime,
}));

let coreBytes = 0;
for (const entry of runtimeCoreEntries) {
  const sourceReference = sourceForRuntime(manifest.source.coreDirectory, entry.runtime);
  const source = resolveProjectAsset(sourceReference);
  const destination = resolveRuntimeAsset(entry.runtime);
  const lossless = /^(eyeBases|pupils|eyelids|mouths)\./.test(entry.key);
  coreBytes += await convert({
    source,
    destination,
    width: manifest.canvas.width,
    height: manifest.canvas.height,
    resize: {
      enabled: true,
      sourceWidth: manifest.source.canvas.width,
      sourceHeight: manifest.source.canvas.height,
    },
    lossless,
    quality: 88,
  });
}

let walkBytes = 0;
for (const entry of runtimeWalkEntries) {
  const sourceReference = sourceForRuntime(manifest.source.walk.directory, entry.runtime);
  const source = resolveProjectAsset(sourceReference);
  const destination = resolveRuntimeAsset(entry.runtime);
  walkBytes += await convert({
    source,
    destination,
    width: manifest.walk.canvas.width,
    height: manifest.walk.canvas.height,
    resize: {
      enabled:
        manifest.source.walk.canvas.width !== manifest.walk.canvas.width ||
        manifest.source.walk.canvas.height !== manifest.walk.canvas.height,
      sourceWidth: manifest.source.walk.canvas.width,
      sourceHeight: manifest.source.walk.canvas.height,
    },
    lossless: false,
  });
}

let arrivalBytes = 0;
for (const entry of runtimeArrivalEntries) {
  const sourceReference = sourceForRuntime(manifest.source.arrival.directory, entry.runtime);
  const source = resolveProjectAsset(sourceReference);
  const destination = resolveRuntimeAsset(entry.runtime);
  arrivalBytes += await convert({
    source,
    destination,
    width: manifest.arrival.canvas.width,
    height: manifest.arrival.canvas.height,
    resize: {
      enabled: false,
      sourceWidth: manifest.source.arrival.canvas.width,
      sourceHeight: manifest.source.arrival.canvas.height,
    },
    lossless: false,
    quality: 86,
  });
}

const packageBytes = coreBytes + walkBytes + arrivalBytes;
console.log(
  `Prepared ${runtimeCoreEntries.length + runtimeWalkEntries.length + runtimeArrivalEntries.length} ` +
    'runtime WebP assets: ' +
    `${(coreBytes / 1024).toFixed(1)} KiB core, ${(walkBytes / 1024).toFixed(1)} KiB walk, ` +
    `${(arrivalBytes / 1024).toFixed(1)} KiB arrival, ` +
    `${(packageBytes / 1024).toFixed(1)} KiB total.`,
);
if (coreBytes > 300 * 1024 || packageBytes > 800 * 1024) {
  throw new Error('Prepared runtime exceeds the 300 KiB core or 800 KiB full-package budget.');
}
