import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const defaultFontSource = join(
  homedir(),
  'Library/Application Support/abnerworks.Typora/themes/phycat/LXGWWenKai-Regular.ttf',
);
const fontSource = process.env.LXGW_WENKAI_SOURCE || defaultFontSource;
const outputFile = join(projectRoot, 'src/assets/fonts/lxgw-wenkai-v1.521-blog.woff2');
const renderedPunctuation = '…‘’“”–—';

const collectMarkdownFiles = (directory) => readdirSync(directory)
  .map((name) => join(directory, name))
  .filter((path) => statSync(path).isFile() && path.endsWith('.md'));

const corpusFiles = [
  ...collectMarkdownFiles(join(projectRoot, 'src/content/blog')),
  join(projectRoot, 'src/lib/writing.js'),
  join(projectRoot, 'src/pages/blog/[slug].astro'),
  join(projectRoot, 'src/components/ArticleToc.astro'),
  join(projectRoot, 'src/styles/article-sakura.css'),
];

if (!existsSync(fontSource)) {
  console.error(`找不到霞鹜文楷源字体：${fontSource}`);
  console.error('可通过 LXGW_WENKAI_SOURCE 指定 LXGWWenKai-Regular.ttf 的位置。');
  process.exit(1);
}

// Astro turns some ASCII punctuation into typographic glyphs while rendering.
// Include those output characters even when they do not appear in the source Markdown.
const corpus = `${corpusFiles.map((path) => readFileSync(path, 'utf8')).join('\n')}\n${renderedPunctuation}`;
const uniqueCharacters = [...new Set(corpus)].sort().join('');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lxgw-blog-subset-'));
const corpusFile = join(temporaryDirectory, 'corpus.txt');

try {
  writeFileSync(corpusFile, uniqueCharacters, 'utf8');
  mkdirSync(dirname(outputFile), { recursive: true });

  const result = spawnSync(
    process.env.PYFTSUBSET || 'pyftsubset',
    [
      fontSource,
      `--text-file=${corpusFile}`,
      `--output-file=${outputFile}`,
      '--flavor=woff2',
      '--name-IDs=0,1,2,3,4,5,6,13,14',
      '--name-languages=*',
      '--notdef-glyph',
      '--notdef-outline',
      '--recommended-glyphs',
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `pyftsubset 退出状态：${result.status}`);
  }

  const size = statSync(outputFile).size;
  console.log(`已生成 ${basename(outputFile)}（${Math.ceil(size / 1024)} KiB）`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
