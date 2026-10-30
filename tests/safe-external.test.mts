import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { isSafeExternal } = createRequire(import.meta.url)('../electron/safe-external.js');

test('links leave the app only for the web and email', () => {
  for (const ok of ['https://www.youtube.com/watch?v=x', 'http://example.com', 'mailto:me@example.com']) assert.equal(isSafeExternal(ok), true, ok);
  for (const no of ['file:///C:/Windows/System32/calc.exe', 'smb://host/share', 'ms-msdt:/id', 'javascript:alert(1)', 'vscode://x', 'not a url', '']) {
    assert.equal(isSafeExternal(no), false, no);
  }
});
