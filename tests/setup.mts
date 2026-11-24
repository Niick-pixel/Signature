// Loaded before every test file (package.json "test"). The trader's clock is the
// computer's own (lib/traderZone); the tests pin Costa Rica, UTC−6, so they read
// the same on any machine and in CI.
process.env.SIGNATURE_TRADER_UTC_OFFSET ??= '-6';
// Cached results (db/dataVersion) are shared between callers: frozen in tests, so an in-place edit throws.
process.env.SIGNATURE_FREEZE_CACHE ??= '1';
