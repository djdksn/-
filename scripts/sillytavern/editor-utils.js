/**
 * Pure utilities for the lorebook/preset editor UIs.
 * No IndexedDB — only data transformations.
 */

const ENTRY_DEFAULTS = Object.freeze({
  keys: [],
  secondaryKeys: [],
  content: '',
  order: 100,
  position: 'after_char',
  selective: false,
  selectiveLogic: 'and_any',
  constant: false,
  probability: 100,
  useProbability: false,
  addMemo: false,
});

export function createDefaultEntry() {
  return { id: crypto.randomUUID(), ...ENTRY_DEFAULTS };
}

export function applyEntryDefaults(partial) {
  return { id: partial.id ?? crypto.randomUUID(), ...ENTRY_DEFAULTS, ...partial };
}

export function createDefaultLorebook(name) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    entries: [],
    recursiveScanning: false,
    caseSensitive: false,
    matchWholeWords: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateEntry(book, entryId, patch) {
  const idx = book.entries.findIndex(e => e.id === entryId);
  if (idx < 0) return book;
  const nextEntries = book.entries.slice();
  nextEntries[idx] = { ...nextEntries[idx], ...patch };
  return { ...book, entries: nextEntries, updatedAt: Date.now() };
}

export function removeEntry(book, entryId) {
  const idx = book.entries.findIndex(e => e.id === entryId);
  if (idx < 0) return book;
  const nextEntries = book.entries.slice();
  nextEntries.splice(idx, 1);
  return { ...book, entries: nextEntries, updatedAt: Date.now() };
}

export function movePromptItem(arr, from, to) {
  if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback ?? min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
