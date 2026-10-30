// `next build --output standalone` emits a server and its dependencies, but
// deliberately leaves out the static assets — it assumes a CDN serves them.
// A desktop app has no CDN, so copy them in beside the server.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  console.error('[signature] .next/standalone is missing — run `next build` first.');
  process.exit(1);
}

cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });

// Migrations are read at runtime, so they have to travel with the build.
const migrations = path.join(standalone, 'db', 'migrations');
mkdirSync(migrations, { recursive: true });
cpSync(path.join(root, 'db', 'migrations'), migrations, { recursive: true });

// The window icon (electron/main.js). It used to arrive only because the
// build traced the whole project; it is copied on purpose now.
mkdirSync(path.join(standalone, 'assets'), { recursive: true });
cpSync(path.join(root, 'assets', 'icon.ico'), path.join(standalone, 'assets', 'icon.ico'));

if (existsSync(path.join(root, 'public'))) {
  cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
}

// Belt and braces. next.config excludes ./data from file tracing, but a build
// that shipped somebody's journal inside the executable is bad enough that it
// is worth checking again here rather than trusting one setting.
const leaked = path.join(standalone, 'data');
if (existsSync(leaked)) {
  rmSync(leaked, { recursive: true, force: true });
  console.warn('[signature] removed a data/ directory that leaked into the bundle');
}

console.log('[signature] standalone bundle assembled');
