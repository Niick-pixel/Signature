/**
 * Which links may leave the app for the system's handler.
 *
 * shell.openExternal hands a URL to whatever the OS has registered for its
 * scheme — file:, smb: and custom protocol handlers included, which can run
 * programs. A journal only ever needs the web and email.
 */
const ALLOWED = new Set(['https:', 'http:', 'mailto:']);

function isSafeExternal(url) {
  try { return ALLOWED.has(new URL(url).protocol); } catch { return false; }
}

module.exports = { isSafeExternal };
