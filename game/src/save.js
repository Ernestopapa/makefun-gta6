// Saving Solmar Bay: where Rae is, what Rae owns, and how the story stands.
// Local storage only — the game runs offline, so the save lives in the browser.
const KEY = 'solmar-bay-save-v1';

export function saveGame(snapshot) {
  try {
    const data = { ...snapshot, version: 1, savedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    if (typeof data.x !== 'number' || typeof data.money !== 'number') return null;
    if (!Array.isArray(data.states)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // No storage, nothing to clear.
  }
}
