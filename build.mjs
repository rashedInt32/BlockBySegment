import * as esbuild from 'esbuild';
import { rm, mkdir, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const outdir = 'dist';
const srcdir = 'src';

// ES-module bundles (background SW + the extension pages, loaded as <script type="module">).
const esmEntries = [
  'background/index.ts',
  'popup/popup.ts',
  'options/options.ts',
  'blocked/blocked.ts',
].map((p) => path.join(srcdir, p));

// Classic-script bundles (content scripts run in an isolated world, not as modules).
const iifeEntries = ['content/heartbeat.ts'].map((p) => path.join(srcdir, p));

// Static assets copied verbatim (preserving relative path under src/).
const staticFiles = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css',
  'options/options.html',
  'options/options.css',
  'blocked/blocked.html',
  'blocked/blocked.css',
  'shared/ui.css',
];

async function copyStatics() {
  for (const rel of staticFiles) {
    const from = path.join(srcdir, rel);
    const to = path.join(outdir, rel);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to);
  }
  if (existsSync('icons')) {
    for (const f of await readdir('icons')) {
      if (f.endsWith('.png')) {
        await mkdir(path.join(outdir, 'icons'), { recursive: true });
        await cp(path.join('icons', f), path.join(outdir, 'icons', f));
      }
    }
  }
}

function commonOptions(extra) {
  return {
    bundle: true,
    target: 'es2022',
    sourcemap: watch ? 'inline' : false,
    logLevel: 'info',
    outbase: srcdir,
    outdir,
    ...extra,
  };
}

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  const esmOpts = commonOptions({ entryPoints: esmEntries, format: 'esm' });
  const iifeOpts = commonOptions({ entryPoints: iifeEntries, format: 'iife' });

  if (watch) {
    const c1 = await esbuild.context(esmOpts);
    const c2 = await esbuild.context(iifeOpts);
    await c1.rebuild();
    await c2.rebuild();
    await copyStatics();
    await c1.watch();
    await c2.watch();
    const { watch: fsWatch } = await import('node:fs');
    fsWatch(srcdir, { recursive: true }, async (_e, file) => {
      if (file && !file.endsWith('.ts')) {
        try {
          await copyStatics();
          console.log('copied statics');
        } catch {}
      }
    });
    console.log('watching…');
  } else {
    await esbuild.build(esmOpts);
    await esbuild.build(iifeOpts);
    await copyStatics();
    console.log('build complete -> dist/');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
