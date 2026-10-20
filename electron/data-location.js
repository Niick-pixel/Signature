// Where the journal lives, and how that is decided.
//
// Three ways Signature runs, three answers:
//
//   from source      ./data beside the code, always.
//   portable .exe    a data/ folder beside the executable, so a copy on a USB
//                    stick carries its journal with it (unchanged).
//   installed        a folder YOU chose, remembered in location.json in the
//                    app's own settings folder. An installer replaces the
//                    program folder on every update, so the journal can never
//                    live there — and it is asked for rather than assumed,
//                    because this is the folder worth backing up.
//
// Nothing here imports Electron: the dialogs are handed in, so every branch
// can be tested with plain Node.

const fs = require('node:fs');
const path = require('node:path');

const LOCATION_FILE = 'location.json';
const FOLDER_NAME = 'Signature Journal';

const isJournal = (dir) => {
  try { return fs.statSync(path.join(dir, 'journal.db')).isFile(); } catch { return false; }
};
const isEmptyOrMissing = (dir) => {
  try { return fs.readdirSync(dir).filter((f) => !f.startsWith('.')).length === 0; } catch { return true; }
};

function readLocation(settingsDir) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(settingsDir, LOCATION_FILE), 'utf8'));
    return typeof saved.dataDir === 'string' && saved.dataDir ? saved.dataDir : null;
  } catch {
    return null;
  }
}

function writeLocation(settingsDir, dataDir) {
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(path.join(settingsDir, LOCATION_FILE),
    JSON.stringify({ dataDir, chosenAt: new Date().toISOString() }, null, 2));
}

/**
 * A folder that is fine to put a journal in.
 *
 * An existing journal is used as it is. An empty folder is used directly. A
 * folder with other things in it (Documents, the Desktop) gets a "Signature
 * Journal" folder inside it rather than the journal's files scattered among
 * everything else.
 */
function journalFolderIn(chosen) {
  if (isJournal(chosen) || isEmptyOrMissing(chosen)) return chosen;
  return path.join(chosen, FOLDER_NAME);
}

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decides the data folder for an installed copy.
 *
 * `ask` shows a message with buttons and resolves to the index clicked;
 * `pickFolder` shows a folder chooser and resolves to a path or null. Both are
 * Electron dialogs in the app and stubs in the tests.
 *
 * Never falls back silently: a saved folder that has gone (an unplugged drive,
 * a renamed folder) is reported and asked about, because quietly starting an
 * empty journal somewhere else is how a journal "loses" a month of trades.
 */
async function resolveInstalled({ settingsDir, documentsDir, ask, pickFolder }) {
  const saved = readLocation(settingsDir);
  const suggested = path.join(documentsDir, FOLDER_NAME);

  if (saved) {
    for (;;) {
      if (fs.existsSync(saved) && writable(saved)) return { dataDir: saved, chosen: false };
      const answer = await ask({
        title: 'Your journal folder is not available',
        message: 'Signature cannot reach the folder your journal is kept in.',
        detail: `${saved}\n\nIf it is on a drive that is not connected, connect it and try again. Nothing has been created anywhere else.`,
        buttons: ['Try again', 'Choose another folder…', 'Quit'],
      });
      if (answer === 2) return { dataDir: null, chosen: false };
      if (answer === 1) {
        const picked = await chooseFolder({ ask, pickFolder });
        if (picked) { writeLocation(settingsDir, picked); return { dataDir: picked, chosen: true }; }
      }
    }
  }

  // First run of an installed copy.
  for (;;) {
    const answer = await ask({
      title: 'Where should Signature keep your journal?',
      message: 'Choose where your journal lives',
      detail: 'Your trades, charts and backups are kept together in one folder. Pick one you back up — it stays put when Signature updates.\n\n'
        + `Suggested: ${suggested}\n\nAlready have a journal (the data folder beside the old portable Signature)? Choose "Open an existing journal" and point at it.`,
      buttons: ['Use the suggested folder', 'Choose a folder…', 'Open an existing journal…'],
    });
    let dataDir = null;
    if (answer === 0) dataDir = suggested;
    else if (answer === 1) dataDir = await chooseFolder({ ask, pickFolder });
    else if (answer === 2) dataDir = await chooseExisting({ ask, pickFolder });
    if (dataDir && writable(dataDir)) {
      writeLocation(settingsDir, dataDir);
      return { dataDir, chosen: true };
    }
    if (dataDir) {
      await ask({ title: 'That folder cannot be used', message: 'Signature cannot write to that folder.', detail: dataDir, buttons: ['Choose again'] });
    }
  }
}

async function chooseFolder({ pickFolder }) {
  const picked = await pickFolder('Choose a folder for your journal');
  return picked ? journalFolderIn(picked) : null;
}

async function chooseExisting({ ask, pickFolder }) {
  for (;;) {
    const picked = await pickFolder('Open the folder that holds journal.db');
    if (!picked) return null;
    if (isJournal(picked)) return picked;
    if (isJournal(path.join(picked, 'data'))) return path.join(picked, 'data');
    const again = await ask({
      title: 'No journal there',
      message: 'That folder does not contain a Signature journal (journal.db).',
      detail: `${picked}\n\nThe portable version keeps it in a folder called "data" beside Signature.exe.`,
      buttons: ['Look again', 'Cancel'],
    });
    if (again !== 0) return null;
  }
}

/**
 * Copies a journal folder somewhere new, for "Move journal…".
 *
 * Copies, never moves: the old folder is left exactly as it was until you
 * delete it yourself. The server must be stopped first so the database file
 * and its write-ahead log are consistent on disk.
 */
function copyJournal(from, to) {
  if (path.resolve(from) === path.resolve(to)) throw new Error('That is already where the journal is.');
  if (path.resolve(to).startsWith(path.resolve(from) + path.sep)) {
    throw new Error('The new folder cannot be inside the current journal folder.');
  }
  if (!isEmptyOrMissing(to)) throw new Error('The new folder must be empty.');
  fs.mkdirSync(to, { recursive: true });
  // Entry by entry into the (empty) target: newer Node refuses to cpSync a
  // folder onto one that already exists, even an empty one, with errorOnExist.
  for (const entry of fs.readdirSync(from)) {
    fs.cpSync(path.join(from, entry), path.join(to, entry), { recursive: true, errorOnExist: true, force: false });
  }
  if (isJournal(from) && !isJournal(to)) throw new Error('The copy did not complete.');
  const size = (d) => fs.statSync(path.join(d, 'journal.db')).size;
  if (isJournal(from) && size(from) !== size(to)) throw new Error('The copied journal does not match the original.');
}

module.exports = {
  FOLDER_NAME, LOCATION_FILE, readLocation, writeLocation, journalFolderIn, isJournal,
  resolveInstalled, copyJournal,
};
