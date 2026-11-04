/**
 * Unified input: keyboard (physical keys, so ZQSD on AZERTY == WASD on QWERTY),
 * mouse drag to orbit, wheel zoom, click/tap, and a virtual joystick on touch.
 */

export interface ClickEvent {
  x: number;
  y: number;
}

/**
 * Movement actions. Physical keys (KeyboardEvent.code) are the reference:
 * ZQSD on AZERTY and WASD on QWERTY are the same physical keys.
 * Both letter sets are mapped so the game keeps working when a browser reports
 * layout-dependent codes (e.g. Firefox "resistFingerprinting", some VMs and
 * remote desktops): there, AZERTY Z arrives as "KeyZ" and Q as "KeyQ".
 */
export type MoveAction = 'up' | 'down' | 'left' | 'right';

const CODE_ACTIONS: Record<string, MoveAction> = {
  KeyW: 'up',
  KeyZ: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyQ: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** Fallback when `code` is empty / unidentified (some virtual or remote keyboards). */
const KEY_ACTIONS: Record<string, MoveAction> = {
  z: 'up',
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  q: 'left',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
};

/** Stable identifier of a physical key: its code, or its key value when the code is missing. */
export function keyToken(e: { code: string; key: string }): string {
  return e.code && e.code !== 'Unidentified' ? e.code : `key:${(e.key || '').toLowerCase()}`;
}

/** Movement action of a key event, or null. */
export function actionOf(e: { code: string; key: string }): MoveAction | null {
  if (e.code && e.code !== 'Unidentified') return CODE_ACTIONS[e.code] ?? null;
  return KEY_ACTIONS[(e.key || '').toLowerCase()] ?? null;
}

/** Pure helper (unit-tested): movement vector from held actions + joystick, normalized. */
export function moveVector(held: Set<MoveAction>, joyX = 0, joyY = 0): { x: number; y: number } {
  let x = joyX;
  let y = joyY;
  if (held.has('up')) y += 1;
  if (held.has('down')) y -= 1;
  if (held.has('left')) x -= 1;
  if (held.has('right')) x += 1;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

export class Input {
  readonly keys = new Set<string>();
  /** Token → movement action, for keys currently held. */
  private heldMoves = new Map<string, MoveAction>();
  private pressedThisFrame = new Set<string>();
  /** Movement intent in [-1,1]², x = right, y = forward. */
  readonly move = { x: 0, y: 0 };
  orbitDx = 0;
  orbitDy = 0;
  zoomDelta = 0;
  readonly clicks: ClickEvent[] = [];
  /** Last known mouse position (for hover tooltips). */
  readonly pointer = { x: -1, y: -1, inside: false };
  isTouch = false;
  /** Any input this session (used to dismiss the idle camera). */
  lastActivity = performance.now();

  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0, moved: false };
  private drags = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean; button: number }>();
  private joyEl: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  enabled = true;
  private pinch = 0;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      // A form control (slider, select, button) keeping the focus must never eat game keys.
      blurControls();
      const tok = keyToken(e);
      if (!this.keys.has(tok)) this.pressedThisFrame.add(tok);
      this.keys.add(tok);
      if (e.code && tok !== e.code) this.keys.add(e.code);
      const act = actionOf(e);
      if (act) {
        this.heldMoves.set(tok, act);
        e.preventDefault();
      }
      this.lastActivity = performance.now();
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const tok = keyToken(e);
      this.keys.delete(tok);
      this.keys.delete(e.code);
      this.heldMoves.delete(tok);
    });
    const releaseAll = () => {
      this.keys.clear();
      this.heldMoves.clear();
    };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);
    // Typing in a text field releases movement keys so the player doesn't run off.
    document.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) releaseAll();
    });

    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    el.addEventListener('pointerleave', () => (this.pointer.inside = false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        this.zoomDelta += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60);
        e.preventDefault();
      },
      { passive: false },
    );

    this.joyEl = document.createElement('div');
    this.joyEl.className = 'joystick';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joystick-knob';
    this.joyEl.appendChild(this.joyKnob);
    document.body.appendChild(this.joyEl);

    this.isTouch = matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', this.isTouch);
  }

  pressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressedThisFrame.has(c));
  }

  held(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Call once per frame, after the game consumed the inputs. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.orbitDx = 0;
    this.orbitDy = 0;
    this.zoomDelta = 0;
    this.clicks.length = 0;
  }

  update(): void {
    if (!this.enabled) {
      this.move.x = this.move.y = 0;
      return;
    }
    const acts = new Set(this.heldMoves.values());
    const v = moveVector(acts, this.joy.id >= 0 ? this.joy.x : 0, this.joy.id >= 0 ? this.joy.y : 0);
    this.move.x = v.x;
    this.move.y = v.y;
  }

  private onDown(e: PointerEvent): void {
    this.lastActivity = performance.now();
    if (e.pointerType === 'touch') {
      this.isTouch = true;
      document.body.classList.add('touch');
    }
    if (e.pointerType === 'touch' && this.joy.id < 0 && e.clientX < window.innerWidth * 0.42 && e.clientY > window.innerHeight * 0.35) {
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0, t: performance.now(), moved: false };
      this.joyEl.style.left = `${e.clientX}px`;
      this.joyEl.style.top = `${e.clientY}px`;
      this.joyEl.classList.add('on');
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
      return;
    }
    this.drags.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, button: e.button });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.inside = e.target === this.el;
    }
    if (e.pointerId === this.joy.id) {
      const max = 46;
      let dx = e.clientX - this.joy.ox;
      let dy = e.clientY - this.joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > 10) this.joy.moved = true;
      if (l > max) {
        dx = (dx / l) * max;
        dy = (dy / l) * max;
      }
      this.joy.x = dx / max;
      this.joy.y = -dy / max;
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      return;
    }
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    if (this.drags.size === 2) {
      // Pinch to zoom.
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved = true;
      const [a, b] = [...this.drags.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0) this.zoomDelta += (this.pinch - dist) / 40;
      this.pinch = dist;
      return;
    }
    this.pinch = 0;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > (e.pointerType === 'touch' ? 10 : 5)) d.moved = true;
    if (d.moved) {
      const k = e.pointerType === 'touch' ? 1.4 : 1;
      this.orbitDx += dx * k;
      this.orbitDy += dy * k;
      this.lastActivity = performance.now();
    }
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    if (e.pointerId === this.joy.id) {
      // A quick tap that never moved the stick is a normal tap (e.g. on the crystal).
      if (!cancelled && !this.joy.moved && performance.now() - this.joy.t < 300 && this.enabled) this.clicks.push({ x: this.joy.ox, y: this.joy.oy });
      this.joy.id = -1;
      this.joy.x = this.joy.y = 0;
      this.joyEl.classList.remove('on');
      return;
    }
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    this.drags.delete(e.pointerId);
    this.pinch = 0;
    if (!cancelled && !d.moved && d.button === 0 && this.enabled) this.clicks.push({ x: e.clientX, y: e.clientY });
  }

  get dragging(): boolean {
    for (const d of this.drags.values()) if (d.moved) return true;
    return false;
  }
}

/** Remove focus from sliders / selects / buttons so the keyboard drives the game again. */
function blurControls(): void {
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === 'BUTTON' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && (a as HTMLInputElement).type !== 'text'))) a.blur();
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text'));
}
