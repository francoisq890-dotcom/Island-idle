/**
 * Unified input: keyboard (physical keys, so ZQSD on AZERTY == WASD on QWERTY),
 * mouse drag to orbit, wheel zoom, click/tap, and a virtual joystick on touch.
 */

export interface ClickEvent {
  x: number;
  y: number;
}

export class Input {
  readonly keys = new Set<string>();
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

  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private drags = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean; button: number }>();
  private joyEl: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  enabled = true;
  private pinch = 0;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
      this.lastActivity = performance.now();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

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

    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
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
    let x = 0;
    let y = 0;
    if (this.enabled) {
      if (this.held('KeyW', 'ArrowUp')) y += 1;
      if (this.held('KeyS', 'ArrowDown')) y -= 1;
      if (this.held('KeyA', 'ArrowLeft')) x -= 1;
      if (this.held('KeyD', 'ArrowRight')) x += 1;
      if (this.joy.id >= 0) {
        x += this.joy.x;
        y += this.joy.y;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
  }

  private onDown(e: PointerEvent): void {
    this.lastActivity = performance.now();
    if (e.pointerType === 'touch') {
      this.isTouch = true;
      document.body.classList.add('touch');
    }
    if (e.pointerType === 'touch' && this.joy.id < 0 && e.clientX < window.innerWidth * 0.42 && e.clientY > window.innerHeight * 0.35) {
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
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

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}
