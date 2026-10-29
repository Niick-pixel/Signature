import path from 'node:path';

/**
 * Everything Signature owns lives under one directory. Back it up and you have
 * backed up the entire journal.
 *
 * Where that directory is depends on how the app was started:
 *
 *   - from source (`npm run desktop`, `npm run dev`) it is ./data
 *   - from a packaged build the Electron shell passes SIGNATURE_DATA_DIR, which
 *     points beside the executable — so a portable copy on a USB stick carries
 *     its own journal and writes nothing to the host machine.
 *
 * process.cwd() is not trustworthy in a packaged app, which is why this is
 * handed in rather than inferred.
 */
export const DATA_DIR = process.env.SIGNATURE_DATA_DIR
  ? path.resolve(process.env.SIGNATURE_DATA_DIR)
  : path.join(process.cwd(), 'data');

export const DB_PATH = path.join(DATA_DIR, 'journal.db');
export const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
/** Small copies of the screenshots for the board's cards — derived, safe to delete. */
export const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
/** Your own backgrounds (Settings → Personalization): furniture, like the preferences — not in the backup. */
export const BACKGROUNDS_DIR = path.join(DATA_DIR, 'backgrounds');

/**
 * Migration files ship as .sql on disk, so their location has the same problem.
 */
export const MIGRATIONS_DIR = process.env.SIGNATURE_MIGRATIONS_DIR
  ? path.resolve(process.env.SIGNATURE_MIGRATIONS_DIR)
  : path.join(process.cwd(), 'db', 'migrations');
