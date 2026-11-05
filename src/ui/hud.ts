/** Heads-up display: resources, objective, interaction prompt, tooltips, floating numbers, toasts. */
import { formatNumber, formatRate } from '../economy/format';
import type { Cost } from '../config/economy';
import { ICONS, type IconName } from './icons';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function costHtml(c: Cost, have?: { shards: number; lumen: number }): string {
  const parts: string[] = [];
  if (c.shards) parts.push(`<span class="${have && have.shards < c.shards ? 'no' : ''}">${ICONS.shard}${formatNumber(c.shards)}</span>`);
  if (c.lumen) parts.push(`<span class="${have && have.lumen < c.lumen ? 'no' : ''}">${ICONS.lumen}${formatNumber(c.lumen)}</span>`);
  return parts.join(' ') || 'Gratuit';
}

interface Floater {
  el: HTMLElement;
  wx: number;
  wy: number;
  wz: number;
  t: number;
  life: number;
  dx: number;
  rise: number;
}

export type Projector = (x: number, y: number, z: number, out: { x: number; y: number; visible: boolean }) => void;

export class Hud {
  readonly root = el('div');
  private resShards = el('div', 'res shards');
  private resLumen = el('div', 'res lumen hide');
  private resSeeds = el('div', 'res seeds hide');
  private objective = el('div', 'objective out');
  private promptEl = el('div', 'prompt');
  private tipEl = el('div', 'tip vellum-thin');
  private floaters = el('div', 'floaters');
  private toasts = el('div', 'toasts');
  private compassEl = el('div', 'compass', '<i></i>');
  private clockEl = el('div', 'clock-dial');
  readonly actions = el('div', 'actions');
  readonly workshopBtn: HTMLButtonElement;
  readonly prestigeBtn: HTMLButtonElement;
  readonly menuBtn: HTMLButtonElement;
  readonly journalBtn: HTMLButtonElement;
  readonly runesBtn: HTMLButtonElement;
  readonly muteBtn: HTMLButtonElement;
  readonly actBtn: HTMLButtonElement;
  readonly jumpBtn: HTMLButtonElement;
  private floats: Floater[] = [];
  private cache = new Map<string, string>();
  private last = { shards: -1, lumen: -1 };
  private tmp = { x: 0, y: 0, visible: false };

  constructor(parent: HTMLElement, private project: Projector) {
    this.root.id = 'hud';
    this.root.classList.add('hidden');
    const resources = el('div', 'resources');
    this.resShards.innerHTML = `${ICONS.shard}<div><div class="val">0</div><div class="rate">Éclats</div></div>`;
    this.resLumen.innerHTML = `${ICONS.lumen}<div><div class="val">0</div><div class="rate">Lumen</div></div>`;
    this.resSeeds.innerHTML = `${ICONS.seed}<div><div class="val">0</div><div class="rate">Graines d’étoile</div></div>`;
    this.resShards.title = 'Éclats : la ressource de base, récoltée sur les cristaux';
    this.resLumen.title = 'Lumen : produit par les raffineries, sert aux ponts et machines rares';
    this.resSeeds.title = 'Graines d’étoile : bonus permanent de production (prestige)';
    resources.append(this.resShards, this.resLumen, this.resSeeds, this.clockEl);
    this.clockEl.innerHTML = `<svg viewBox="0 0 40 40" class="dial"><circle cx="20" cy="20" r="16" class="track"/><circle cx="20" cy="20" r="16" class="arc" pathLength="100"/></svg><span class="glyph"></span><span class="txt"></span>`;
    this.clockEl.title = 'Cycle du jour et de la nuit : la nuit, la chance des runes monte de 50 %';

    this.objective.innerHTML = `<div class="tag">objectif</div><div class="text"></div><div class="hint"></div><div class="bar"><i></i></div><div class="count"></div>`;

    const btn = (cls: string, html: string, title: string) => {
      const b = el('button', 'btn ' + cls, html) as HTMLButtonElement;
      b.title = title;
      return b;
    };
    this.prestigeBtn = btn('prestige hide', `${ICONS.lighthouse}<span class="label">Phare</span><kbd>P</kbd>`, 'Faire descendre l’île (prestige)');
    this.workshopBtn = btn('', `${ICONS.hammer}<span class="label">Atelier</span><kbd>B</kbd><span class="badge"></span>`, 'Atelier : machines et améliorations');
    this.muteBtn = btn('icon-only', ICONS.sound, 'Son (M)');
    this.journalBtn = btn('icon-only', ICONS.trophy, 'Journal : succès et constellations (J)');
    this.runesBtn = btn('icon-only hide', ICONS.rune, 'Runes (R)');
    this.menuBtn = btn('icon-only', `${ICONS.menu}`, 'Carnet de bord (Échap)');
    this.actions.append(this.prestigeBtn, this.runesBtn, this.workshopBtn, this.journalBtn, this.muteBtn, this.menuBtn);

    const pad = el('div', 'touch-pad');
    this.jumpBtn = el('button', 'touch-btn small', ICONS.jump) as HTMLButtonElement;
    this.actBtn = el('button', 'touch-btn act', `${ICONS.hand}<span>Action</span>`) as HTMLButtonElement;
    pad.append(this.jumpBtn, this.actBtn);

    this.root.append(resources, this.objective, this.actions, this.promptEl, this.tipEl, this.floaters, this.toasts, this.compassEl, pad);
    parent.appendChild(this.root);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  private set(key: string, node: Element, html: string): void {
    if (this.cache.get(key) === html) return;
    this.cache.set(key, html);
    node.innerHTML = html;
  }

  setResources(shards: number, shardRate: number, lumen: number, lumenRate: number, seeds: number, showLumen: boolean, bonusPct: number): void {
    const sv = this.resShards.querySelector('.val')!;
    const sr = this.resShards.querySelector('.rate')!;
    this.set('sv', sv, formatNumber(shards));
    this.set('sr', sr, shardRate > 0 ? `<b>+${formatRate(shardRate)}</b> éclats / s` : 'Éclats');
    this.resLumen.classList.toggle('hide', !showLumen);
    this.set('lv', this.resLumen.querySelector('.val')!, formatNumber(lumen));
    this.set('lr', this.resLumen.querySelector('.rate')!, lumenRate > 0 ? `<b>+${formatRate(lumenRate)}</b> lumen / s` : 'Lumen');
    this.resSeeds.classList.toggle('hide', seeds <= 0);
    this.set('gv', this.resSeeds.querySelector('.val')!, formatNumber(seeds));
    this.set('gr', this.resSeeds.querySelector('.rate')!, `Graines · <b>+${Math.round(bonusPct)} %</b> prod.`);
    if (this.last.shards >= 0 && shards > this.last.shards + Math.max(1, shardRate * 0.6)) this.bump(this.resShards);
    if (this.last.lumen >= 0 && lumen > this.last.lumen + Math.max(1, lumenRate * 0.6)) this.bump(this.resLumen);
    this.last.shards = shards;
    this.last.lumen = lumen;
  }

  /** Day/night dial: progress of the current phase and a short label. */
  setClock(night: boolean, progress: number, label: string, visible: boolean): void {
    this.clockEl.classList.toggle('hide', !visible);
    this.clockEl.classList.toggle('night', night);
    this.set('cg', this.clockEl.querySelector('.glyph')!, night ? ICONS.moon : ICONS.sun);
    this.set('ct', this.clockEl.querySelector('.txt')!, label);
    (this.clockEl.querySelector('.arc') as SVGCircleElement).style.strokeDasharray = `${Math.max(0, Math.min(100, progress * 100)).toFixed(1)} 100`;
  }

  private bump(e: HTMLElement): void {
    e.classList.add('bump');
    window.setTimeout(() => e.classList.remove('bump'), 120);
  }

  setObjective(text: string | null, hint: string, cur: number, goal: number, countLabel: string): void {
    if (!text) {
      this.objective.classList.add('out');
      return;
    }
    this.objective.classList.remove('out');
    this.set('ot', this.objective.querySelector('.text')!, text);
    this.set('oh', this.objective.querySelector('.hint')!, hint);
    (this.objective.querySelector('.bar i') as HTMLElement).style.width = `${Math.min(100, (cur / goal) * 100)}%`;
    this.set('oc', this.objective.querySelector('.count')!, countLabel);
    (this.objective.querySelector('.bar') as HTMLElement).style.display = goal > 1 ? '' : 'none';
  }

  objectiveDone(): void {
    this.objective.classList.remove('done');
    void this.objective.offsetWidth;
    this.objective.classList.add('done');
  }

  setPrompt(html: string | null): void {
    if (!html) {
      this.promptEl.classList.remove('on');
      return;
    }
    this.set('prompt', this.promptEl, html);
    this.promptEl.classList.add('on');
  }

  setTip(html: string | null, x = 0, y = 0): void {
    if (!html) {
      this.tipEl.classList.remove('on');
      return;
    }
    this.set('tip', this.tipEl, html);
    this.tipEl.classList.add('on');
    const w = this.tipEl.offsetWidth;
    const h = this.tipEl.offsetHeight;
    const px = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2));
    // Flip below the anchor when it would cover the objective card at the top.
    const topLimit = window.innerWidth > 760 ? 140 : 70;
    let py = y - h - 14;
    const below = py < topLimit;
    if (below) py = y + 30;
    py = Math.max(8, Math.min(window.innerHeight - h - 90, py));
    this.tipEl.classList.toggle('below', below);
    this.tipEl.style.transform = `translate(${px}px, ${py}px)`;
  }

  setWorkshopBadge(n: number, glow: boolean): void {
    const b = this.workshopBtn.querySelector('.badge')!;
    b.classList.toggle('on', n > 0);
    b.textContent = String(n);
    this.workshopBtn.classList.toggle('glow', glow);
  }

  setPrestige(visible: boolean, glow: boolean): void {
    this.prestigeBtn.classList.toggle('hide', !visible);
    this.prestigeBtn.classList.toggle('glow', glow);
  }

  setMuted(m: boolean): void {
    this.muteBtn.innerHTML = m ? ICONS.mute : ICONS.sound;
  }

  setActionButton(active: boolean, label: string): void {
    this.actBtn.classList.toggle('on', active);
    const s = this.actBtn.querySelector('span')!;
    if (s.textContent !== label) s.textContent = label;
  }

  /** Floating number / text anchored in the world. */
  float(wx: number, wy: number, wz: number, html: string, cls = '', life = 1.1): void {
    if (this.floats.length > 40) {
      const old = this.floats.shift()!;
      old.el.remove();
    }
    const e = el('div', 'float ' + cls, html);
    this.floaters.appendChild(e);
    this.floats.push({ el: e, wx, wy, wz, t: 0, life, dx: (Math.random() - 0.5) * 50, rise: 70 + Math.random() * 30 });
  }

  toast(icon: IconName, title: string, sub = '', tone: '' | 'gold' | 'violet' | 'ether' = ''): void {
    const t = el('div', `toast ${tone}`, `${ICONS[icon]}<div>${title}${sub ? `<small>${sub}</small>` : ''}</div>`);
    this.toasts.appendChild(t);
    window.setTimeout(() => t.remove(), 3800);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
  }

  /** Points to an off-screen target along the screen edge. */
  setCompass(screen: { x: number; y: number; behind: boolean } | null): void {
    if (!screen) {
      this.compassEl.classList.remove('on');
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    let dx = screen.x - cx;
    let dy = screen.y - cy;
    if (screen.behind) {
      dx = -dx;
      dy = -dy;
    }
    const inside = !screen.behind && screen.x > 40 && screen.x < w - 40 && screen.y > 40 && screen.y < h - 40;
    if (inside) {
      this.compassEl.classList.remove('on');
      return;
    }
    const mx = 44;
    const myTop = 150;
    const myBottom = 100;
    const kx = (cx - mx) / Math.max(1e-3, Math.abs(dx));
    const ky = dy < 0 ? (cy - myTop) / Math.max(1e-3, -dy) : (h - myBottom - cy) / Math.max(1e-3, dy);
    const k = Math.min(kx, ky);
    const x = cx + dx * k;
    const y = cy + dy * k;
    this.compassEl.classList.add('on');
    this.compassEl.style.transform = `translate(${x}px, ${y}px)`;
    (this.compassEl.firstChild as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
  }

  update(dt: number): void {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      this.project(f.wx, f.wy, f.wz, this.tmp);
      if (!this.tmp.visible) {
        f.el.style.opacity = '0';
        continue;
      }
      const ease = 1 - Math.pow(1 - k, 3);
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : 1.15 - Math.min(0.15, (k - 0.12) * 0.6);
      const x = this.tmp.x + f.dx * ease;
      const y = this.tmp.y - f.rise * ease;
      f.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${pop})`;
      f.el.style.opacity = String(k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1);
    }
  }
}
