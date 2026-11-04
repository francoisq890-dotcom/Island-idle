import { describe, expect, it } from 'vitest';
import { actionOf, keyToken, moveVector, type MoveAction } from '../src/core/input';
import { Ground } from '../src/world/terrain';

describe('keyboard mapping', () => {
  it('maps physical codes for AZERTY (ZQSD) and QWERTY (WASD)', () => {
    // AZERTY Z/Q/S/D and QWERTY W/A/S/D are the same physical keys.
    expect(actionOf({ code: 'KeyW', key: 'z' })).toBe('up');
    expect(actionOf({ code: 'KeyA', key: 'q' })).toBe('left');
    expect(actionOf({ code: 'KeyS', key: 's' })).toBe('down');
    expect(actionOf({ code: 'KeyD', key: 'd' })).toBe('right');
    expect(actionOf({ code: 'KeyW', key: 'w' })).toBe('up');
    expect(actionOf({ code: 'KeyA', key: 'a' })).toBe('left');
  });
  it('survives browsers that report layout-dependent or missing codes', () => {
    expect(actionOf({ code: 'KeyZ', key: 'z' })).toBe('up');
    expect(actionOf({ code: 'KeyQ', key: 'q' })).toBe('left');
    expect(actionOf({ code: '', key: 'Q' })).toBe('left');
    expect(actionOf({ code: 'Unidentified', key: 'd' })).toBe('right');
    expect(keyToken({ code: '', key: 'Z' })).toBe('key:z');
  });
  it('supports arrows and ignores other keys', () => {
    expect(actionOf({ code: 'ArrowUp', key: 'ArrowUp' })).toBe('up');
    expect(actionOf({ code: 'KeyE', key: 'e' })).toBeNull();
    expect(actionOf({ code: 'Space', key: ' ' })).toBeNull();
  });
  it('normalizes diagonals and cancels opposite keys', () => {
    const v = moveVector(new Set<MoveAction>(['up', 'right']));
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
    expect(moveVector(new Set<MoveAction>(['up', 'down']))).toEqual({ x: 0, y: 0 });
    expect(moveVector(new Set<MoveAction>(['left']))).toEqual({ x: -1, y: 0 });
  });
});

describe('collisions', () => {
  it('never traps the player inside a prop', () => {
    const g = new Ground();
    g.obstacles.push({ x: 0, z: 5, r: 1, zone: 'home', active: () => true });
    expect(g.walkable(0, 5.5)).toBe(false);
    // From inside the prop, moving out is allowed, moving deeper is not.
    expect(g.canMove(0, 5.5, 0, 5.6)).toBe(true);
    expect(g.canMove(0, 5.5, 0, 5.4)).toBe(false);
    // From free ground, entering the prop is refused.
    expect(g.canMove(0, 6.2, 0, 5.9)).toBe(false);
    expect(g.canMove(0, 7, 0, 7.1)).toBe(true);
  });
});
