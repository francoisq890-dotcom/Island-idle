import { describe, expect, it } from 'vitest';
import { deserialize, exportSave, importSave, SaveError, serialize } from '../src/save/save';
import { createInitialState, SAVE_VERSION } from '../src/economy/state';

describe('save', () => {
  it('round-trips through serialize/deserialize', () => {
    const s = createInitialState(1000);
    s.shards = 123.5;
    s.lumen = 7;
    s.machines.drill = 12;
    s.upgrades.pick1 = true;
    s.zones.forge = true;
    s.flags.nearCrystal = true;
    s.seeds = 3;
    s.settings.muted = true;
    s.player = { x: 3, z: -4, yaw: 1.2 };
    const back = deserialize(serialize(s), 2000);
    expect(back).toEqual(s);
  });
  it('round-trips through the text export', () => {
    const s = createInitialState(1000);
    s.shards = 42;
    const code = exportSave(s);
    expect(code.startsWith('ILES1.')).toBe(true);
    expect(importSave(code, 5).shards).toBe(42);
    // whitespace / line breaks pasted around the code are tolerated
    expect(importSave(`  ${code.slice(0, 20)}\n${code.slice(20)}  `, 5).shards).toBe(42);
  });
  it('fills missing or corrupted fields with defaults', () => {
    const s = deserialize(JSON.stringify({ version: SAVE_VERSION, shards: 'abc', machines: { drill: 4, bogus: 9 }, upgrades: { nope: true, pick1: true } }), 0);
    expect(s.shards).toBe(0);
    expect(s.machines.drill).toBe(4);
    expect(s.machines.excavator).toBe(0);
    expect(s.upgrades).toEqual({ pick1: true });
    expect(s.zones.home).toBe(true);
  });
  it('rejects garbage and future versions', () => {
    expect(() => importSave('hello')).toThrow(SaveError);
    expect(() => deserialize('{"version": 999}')).toThrow(SaveError);
    expect(() => deserialize('not json')).toThrow(SaveError);
    expect(() => importSave('ILES1.%%%')).toThrow(SaveError);
  });
});
