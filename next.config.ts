import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server and only the
  // dependencies it actually uses — which is what the packaged desktop build
  // runs, and why the portable exe does not have to carry all of node_modules.
  output: 'standalone',

  // File tracing swept ./data into the bundle, which means a build made on a
  // machine that had been used would carry that machine's journal.db inside
  // the executable. Never ship someone's trades.
  // Source, tests, docs and the Electron shell are not run by the server
  // either (the shell is packaged on its own, see package.json "files").
  outputFileTracingExcludes: {
    '*': ['data/**', 'brand/**', 'release/**', 'build/**', 'tests/**', 'docs/**', 'scripts/**', 'electron/**',
      '*.md', 'tsconfig.tsbuildinfo', 'eslint.config.mjs'],
  },

  // The Electron shell loads the app over 127.0.0.1 while Next's dev server
  // binds localhost, so HMR is cross-origin by Next's reckoning. Allow it, or
  // the desktop window silently loses hot reload.
  allowedDevOrigins: ['127.0.0.1'],

  // You asked for no telemetry. Next also collects its own, anonymously —
  // NEXT_TELEMETRY_DISABLED in .env.local turns that off as well.
  agentRules: false,

  // The floating dev badge sits on top of the whiteboard. Not in a window app.
  devIndicators: false,

  // Tabs stay cached on the client for five minutes, so switching back to a
  // screen is instant instead of a full server render of it. Anything that
  // changes the journal marks the cache stale and the next move loads fresh
  // (lib/freshness.ts) — a cached screen is never shown after a save.
  experimental: {
    staleTimes: { dynamic: 300 },
  },
};

export default nextConfig;
