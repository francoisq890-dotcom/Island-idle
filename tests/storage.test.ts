/**
 * Critical save bugs found by the audit (AUDIT.md § Critiques), one test each:
 *  C1 an imported save was overwritten by the `beforeunload` autosave of the reload;
 *  C2 an unreadable save was replaced by a fresh game at the next autosave;
 *  C3 two tabs on the same save: the stale one overwrote the newer progress.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  claimStorage,
  importSave,
  loadFailure,
  loadFromStorage,
  readBackup,
  saveToStorage,
  serialize,
  STORAGE_KEY,
  writeImportedSave,
  exportSave,
  _resetStorageSession,
} from '../src/save/save';
import { createInitialState, SAVE_VERSION } from '../src/economy/state';

/** Minimal localStorage shared by every "tab" of a test (same origin). */
class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
  key() {
    return null;
  }
  get length() {
    return this.data.size;
  }
}

let mem: MemoryStorage;
beforeEach(() => {
  mem = new MemoryStorage();
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = mem;
  _resetStorageSession('tab-a');
});
afterEach(() => {
  delete (globalThis as unknown as { localStorage?: MemoryStorage }).localStorage;
});

describe('storage safety', () => {
  it('C2: an unreadable save is backed up, never overwritten by a fresh game', () => {
    const future = JSON.stringify({ version: SAVE_VERSION + 1, shards: 1e12, seeds: 400 });
    mem.setItem(STORAGE_KEY, future);
    expect(loadFromStorage()).toBeNull();
    expect(loadFailure()).toMatch(/plus récente/);
    expect(readBackup()).toBe(future);
    expect(mem.getItem(BACKUP_KEY)).toBe(future);
    // The new game autosaves: the player's real progress is still recoverable.
    claimStorage();
    saveToStorage(createInitialState(), 5);
    expect(readBackup()).toBe(future);

    const corrupted = '{"version": 4, "shards": 12';
    mem.setItem(STORAGE_KEY, corrupted);
    expect(loadFromStorage()).toBeNull();
    expect(readBackup()).toBe(corrupted);
    // A raw JSON backup can be pasted back into the import box (spaces kept).
    const ok = createInitialState(0);
    ok.shards = 77;
    ok.flags['a b'] = true;
    expect(importSave(`  ${serialize(ok)}\n`, 0).shards).toBe(77);
  });

  it('C1: an imported save survives the autosave and the beforeunload save of the reload', () => {
    claimStorage();
    const running = createInitialState(0);
    running.shards = 5;
    expect(saveToStorage(running, 1)).toBe('saved');

    const imported = createInitialState(0);
    imported.seeds = 777;
    expect(writeImportedSave(importSave(exportSave(imported), 10), 10)).toBe(true);
    // The page reloads: autosave and beforeunload fire with the old state.
    expect(saveToStorage(running, 20)).toBe('locked');
    expect(saveToStorage(running, 21)).toBe('locked');
    // After the reload, the imported save is what loads.
    _resetStorageSession('tab-a-reloaded');
    expect(loadFromStorage(30)!.seeds).toBe(777);
  });

  it('C3: a tab whose save was claimed by a newer tab stops writing', () => {
    // Tab A plays.
    claimStorage();
    const a = createInitialState(0);
    a.shards = 100;
    expect(saveToStorage(a, 1)).toBe('saved');
    // Tab B opens, loads A's progress and plays further.
    _resetStorageSession('tab-b');
    const b = loadFromStorage(2)!;
    claimStorage();
    b.shards = 5000;
    expect(saveToStorage(b, 3)).toBe('saved');
    // Back to tab A (stale): its autosave / beforeunload must not overwrite B.
    _resetStorageSession('tab-a');
    a.shards = 150;
    expect(saveToStorage(a, 4)).toBe('foreign');
    expect(saveToStorage(a, 5)).toBe('locked');
    _resetStorageSession('tab-c');
    expect(loadFromStorage(6)!.shards).toBe(5000);
  });
});
