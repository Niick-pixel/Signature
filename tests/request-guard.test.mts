import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRequest } from '../lib/requestGuard.ts';

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test('guard: the app itself, curl and the shell are let through', () => {
  assert.equal(checkRequest('GET', h({ host: '127.0.0.1:3000' })).ok, true);
  assert.equal(checkRequest('POST', h({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' })).ok, true);
  assert.equal(checkRequest('POST', h({ host: 'localhost:3312', origin: 'http://localhost:3312' })).ok, true);
  assert.equal(checkRequest('DELETE', h({ host: '127.0.0.1:3000' })).ok, true); // no Origin: not a browser page
  assert.equal(checkRequest('GET', h({ host: '[::1]:3000' })).ok, true);
});

test('guard: a foreign Host is refused, reads included (DNS rebinding)', () => {
  const v = checkRequest('GET', h({ host: 'evil.example:3000' }));
  assert.equal(v.ok, false); assert.equal(!v.ok && v.status, 421);
  assert.equal(checkRequest('GET', h({})).ok, false);
  assert.equal(checkRequest('GET', h({ host: '127.0.0.1.evil.example' })).ok, false);
});

test('guard: writes from another site are refused, reads from it are not our concern (CORS)', () => {
  assert.equal(checkRequest('POST', h({ host: '127.0.0.1:3000', origin: 'https://evil.example' })).ok, false);
  assert.equal(checkRequest('PATCH', h({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1.evil.example' })).ok, false);
  assert.equal(checkRequest('POST', h({ host: '127.0.0.1:3000', origin: 'null' })).ok, false);
  assert.equal(checkRequest('POST', h({ host: '127.0.0.1:3000', 'sec-fetch-site': 'cross-site' })).ok, false);
  assert.equal(checkRequest('GET', h({ host: '127.0.0.1:3000', origin: 'https://evil.example' })).ok, true);
});
