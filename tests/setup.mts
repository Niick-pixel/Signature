// Loaded before every test file (package.json "test"). The trader's clock is the
// computer's own (lib/traderZone); the tests pin Costa Rica, UTC−6, so they read
// the same on any machine and in CI.
process.env.SIGNATURE_TRADER_UTC_OFFSET ??= '-6';
