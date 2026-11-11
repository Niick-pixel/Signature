import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/** Next's own rules (React, hooks, accessibility basics, TypeScript). */
const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'data/**', 'release/**', 'build/**', 'next-env.d.ts', 'types/**'],
  },
  {
    // The Electron shell and build scripts are CommonJS by design.
    files: ['electron/**/*.js', 'scripts/**/*.{js,cjs,mjs}'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    /*
      React Compiler rules. The app does not use the compiler, and these flag
      long-standing deliberate patterns (loading saved state in an effect,
      reading a ref for the latest value in a handler). Kept visible as
      warnings so new code can follow them; not errors.
    */
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Screenshots are local files served by the app's own API: next/image's
      // resizing CDN has nothing to add offline.
      '@next/next/no-img-element': 'off',
      // `{ dropped: _x, ...rest }` is how a field is left out of a copy.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];

export default config;
