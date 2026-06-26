import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const PREFERENCES_FILE = path.join(DATA_DIR, 'preferences.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getPreferences() {
  ensureDataDir();
  if (!fs.existsSync(PREFERENCES_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf-8'));
}

export function savePreferences(preferences) {
  ensureDataDir();
  fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2));
}
