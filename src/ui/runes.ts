/**
 * Rune altar panel (draw + index), rune glyph icons and the rarity celebration.
 */
import { FAMILIES, FAMILY_ORDER, RARITIES, RARITY_INDEX, ROLL, RUNES, STAT_CAP, STAT_LABEL, type FamilyId, type RuneDef, type RuneStat } from '../config/runes';
import type { Rates } from '../economy/economy';
import { formatDuration, formatNumber } from '../economy/format';
import { altarLevel, altarUpgrade, altarUpgradeCost, bulkOf, cooldownOf, familyUnlocked, luckOf, oddsLabel, rarityChances, rollCostOf, runesOf, stacked } from '../economy/runes';
import type { GameState } from '../economy/state';
import { ALTAR_UPGRADES } from '../config/runes';
import { costHtml, el } from './hud';
import { ICONS } from './icons';
import { framePanel, seal, setSeal } from './panels';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A hexagonal rune stone with a procedural glyph (unique per rune). */
export function runeIcon(def: RuneDef | null, found = true, size = 44): string {
  const fam = def ? FAMILIES[def.family] : null;
  const rar = def ? RARITIES[RARITY_INDEX[def.rarity]] : RARITIES[0];
  const fill = found && fam ? fam.css : '#cdbb98';
  const stroke = rar.css;
  let glyph = '';
  if (def && found) {
    const h = hash(def.id);
    const pts = [
      [12, 5],
      [17.5, 8.5],
      [17.5, 15.5],
      [12, 19],
      [6.5, 15.5],
      [6.5, 8.5],
      [12, 12],
    ];
    const segs = 3 + (h % 3);
    let d = '';
    for (let i = 0; i < segs; i++) {
      const a = pts[(h >>> (i * 3)) % 7];
      const b = pts[(h >>> (i * 3 + 2)) % 7];
      if (a !== b) d += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
    }
    glyph = `<path d="${d}" stroke="#fffaf0" stroke-width="1.8" stroke-linecap="round"/>`;
  } else glyph = `<text x="12" y="16" text-anchor="middle" font-size="10" font-family="Fraunces Variable, serif" font-weight="700" fill="#8c7c86">?</text>`;
  const cls = def && found && def.rarity === 'celestial' ? 'rune-ico celestial' : 'rune-ico';
  return `<svg viewBox="0 0 24 24" class="${cls}" width="${size}" height="${size}" aria-hidden="true"><path d="M12 1.5 21.2 6.8v10.4L12 22.5 2.8 17.2V6.8z" fill="${fill}" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 3.6 19.3 7.8v8.4L12 20.4 4.7 16.2V7.8z" fill="none" stroke="rgba(42,32,53,.35)" stroke-width=".8"/>${glyph}</svg>`;
}

export function statText(stat: RuneStat, v: number): string {
  if (stat === 'bulk') return `+${Math.floor(v)} ${STAT_LABEL.bulk}`;
  const pct = v * 100;
  const s = pct >= 100 ? formatNumber(pct) : pct >= 10 ? pct.toFixed(0) : pct.toFixed(pct >= 1 ? 1 : 2);
  return `${stat === 'cost' ? '−' : '+'}${s} % ${STAT_LABEL[stat]}`;
}

export function runeEffect(def: RuneDef, count: number): string {
  const n = Math.max(1, count);
  let t = statText(def.stat, stacked(def.value, n));
  if (def.stat2 && def.value2) t += ` · ${statText(def.stat2, stacked(def.value2, n))}`;
  return t;
}

export interface RuneActions {
  roll(family: FamilyId): void;
  buyAltar(id: 'luck' | 'bulk' | 'speed' | 'auto'): boolean;
  setAuto(family: FamilyId | null): void;
  /** Can the player roll here right now (near the altar or auto-roll)? */
  nearAltar(family: FamilyId): boolean;
  sound(kind: 'tab' | 'hover'): void;
}

export class RunePanel {
  readonly el: HTMLElement;
  family: FamilyId = 'stone';
  private tab: 'draw' | 'index' = 'draw';
  private body: HTMLElement;
  private sig = '';
  private holdTimer: number | null = null;
  private lastRolled = 0;

  constructor(
    private actions: RuneActions,
    private getState: () => GameState,
    private getRates: () => Rates,
  ) {
    this.el = framePanel('modal wide runes', 'altar', 'Autel des runes', '');
    this.el.insertAdjacentHTML('beforeend', `<div class="tabs"><button class="tab on" data-tab="draw">Tirage</button><button class="tab" data-tab="index">Index des runes</button></div><div class="body"></div>`);
    this.body = this.el.querySelector('.body')!;
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as 'draw' | 'index';
        this.el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        this.sig = '';
        this.actions.sound('tab');
        this.refresh();
      }),
    );
  }

  open(family: FamilyId): void {
    this.family = family;
    const f = FAMILIES[family];
    const h2 = this.el.querySelector('header h2 span')!;
    h2.innerHTML = `${f.altarName}<br><span class="sub">${f.blurb}</span>`;
    this.el.style.setProperty('--fam', f.css);
    this.sig = '';
    this.refresh();
  }

  /** Results of the last roll, animated into the tray. */
  showResults(runes: RuneDef[]): void {
    const tray = this.body.querySelector('.tray');
    if (!tray) return;
    const best = runes.reduce((m, r) => Math.max(m, RARITY_INDEX[r.rarity]), 0);
    tray.innerHTML = '';
    // Group identical runes: ×N.
    const groups = new Map<string, { def: RuneDef; n: number }>();
    for (const r of runes) {
      const g = groups.get(r.id);
      if (g) g.n++;
      else groups.set(r.id, { def: r, n: 1 });
    }
    [...groups.values()]
      .sort((a, b) => RARITY_INDEX[b.def.rarity] - RARITY_INDEX[a.def.rarity])
      .forEach((g, i) => {
        const chip = el('div', `chip r${RARITY_INDEX[g.def.rarity]}`, `${runeIcon(g.def, true, 36)}<span>${g.def.name}${g.n > 1 ? ` <b>×${g.n}</b>` : ''}</span>`);
        chip.style.animationDelay = `${i * 50}ms`;
        chip.title = `${RARITIES[RARITY_INDEX[g.def.rarity]].name} · ${runeEffect(g.def, 1)} par copie`;
        tray.appendChild(chip);
      });
    tray.classList.remove('flash');
    void (tray as HTMLElement).offsetWidth;
    tray.classList.add('flash');
    (tray as HTMLElement).style.setProperty('--best', RARITIES[best].css);
    this.lastRolled = performance.now();
  }

  refresh(): void {
    const s = this.getState();
    const sig = this.tab + this.family + (this.tab === 'index' ? Object.keys(s.runes).length : '') + (s.altar.auto ? 'a' : '');
    if (sig !== this.sig) {
      this.sig = sig;
      this.body.innerHTML = this.tab === 'draw' ? this.drawHtml() : this.indexHtml();
      if (this.tab === 'draw') this.wireDraw();
    }
    if (this.tab === 'draw') this.updateDraw();
    else this.updateIndex();
  }

  private drawHtml(): string {
    const runes = runesOf(this.family);
    return `
      <div class="altar-top">
        <div class="altar-roll">
          <div class="slab-art">${runeIcon(runes[RARITIES.length - 1], true, 96)}</div>
          ${seal('big roll')}
          <div class="roll-hint note"></div>
          <label class="auto-toggle"><input type="checkbox" data-auto> Tirage automatique ici</label>
        </div>
        <div class="altar-right">
          <div class="section-title">Dernier tirage</div>
          <div class="tray"><div class="empty">Paie l’autel pour tirer une rune.</div></div>
          <div class="luckline"></div>
        </div>
      </div>
      <div class="section-title">Probabilités</div>
      <table class="odds"><tbody>
        ${RARITIES.map((r, i) => `<tr class="r${i}"><td class="rn"><span class="dot" style="background:${r.css}"></span>${r.name}</td><td class="pr" data-p="${i}"></td><td class="ic">${runeIcon(runes[i], false, 26)}</td><td class="nm" data-n="${i}"></td><td class="ef" data-e="${i}"></td></tr>`).join('')}
      </tbody></table>
      <div class="section-title">Améliorations de l’autel</div>
      ${ALTAR_UPGRADES.map((u) => `<div class="row altar-up" data-up="${u.id}"><div class="medal">${u.id === 'luck' ? ICONS.clover : u.id === 'bulk' ? ICONS.rune : u.id === 'speed' ? ICONS.bolt : ICONS.dice}</div><div class="row-main"><div class="row-title"><span class="nm">${u.name}</span><span class="own"></span></div><div class="meta">${u.desc}</div></div>${seal()}</div>`).join('')}`;
  }

  private wireDraw(): void {
    const btn = this.body.querySelector('.seal.roll') as HTMLElement;
    const start = () => {
      this.actions.roll(this.family);
      this.stopHold();
      // Hold to keep rolling at the altar's cadence.
      this.holdTimer = window.setInterval(() => this.actions.roll(this.family), Math.max(120, cooldownOf(this.getState()) * 1000));
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      start();
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => this.stopHold());
    btn.addEventListener('mouseenter', () => this.actions.sound('hover'));
    this.body.querySelectorAll<HTMLElement>('.altar-up').forEach((row) => {
      const id = row.dataset.up as 'luck' | 'bulk' | 'speed' | 'auto';
      row.querySelector('.seal')!.addEventListener('click', () => {
        if (this.actions.buyAltar(id)) {
          row.classList.remove('stamp');
          void row.offsetWidth;
          row.classList.add('stamp');
        }
      });
    });
    const auto = this.body.querySelector('[data-auto]') as HTMLInputElement;
    auto.addEventListener('change', () => this.actions.setAuto(auto.checked ? this.family : null));
  }

  stopHold(): void {
    if (this.holdTimer !== null) window.clearInterval(this.holdTimer);
    this.holdTimer = null;
  }

  private updateDraw(): void {
    const s = this.getState();
    const r = this.getRates();
    const luck = luckOf(s, r.bonus);
    const bulk = bulkOf(s, r.bonus);
    const near = this.actions.nearAltar(this.family);
    const unlocked = familyUnlocked(s, this.family);
    const rc = rollCostOf(s, this.family);
    const afford = (rc.shards ?? 0) <= s.shards && (rc.lumen ?? 0) <= s.lumen;
    const ok = unlocked && near && afford;
    setSeal(this.body.querySelector('.seal.roll') as HTMLElement, {
      label: bulk > 1 ? `Tirer · ${bulk} runes` : 'Tirer une rune',
      price: costHtml(rc),
      note: !unlocked ? 'île non atteinte' : !near ? 'approche-toi de l’autel' : !afford ? 'pas assez' : 'maintenir pour enchaîner',
      ok,
      progress: 0,
      variant: 'violet',
    });
    const hint = this.body.querySelector('.roll-hint')!;
    const hintTxt = s.runeAuto === this.family ? 'Tirage automatique ici (10 % max. de ta production).' : `${formatNumber(s.runeStats.rolls)} tirages · ${formatNumber(s.runeStats.runes)} runes trouvées`;
    if (hint.textContent !== hintTxt) hint.textContent = hintTxt;
    const autoLbl = this.body.querySelector('.auto-toggle') as HTMLElement;
    autoLbl.style.display = s.altar.auto ? '' : 'none';
    (this.body.querySelector('[data-auto]') as HTMLInputElement).checked = s.runeAuto === this.family;

    const line = `<span>${ICONS.clover} Chance <b>×${luck.toFixed(2)}</b></span><span>${ICONS.rune} Charge <b>${bulk}</b></span><span>${ICONS.bolt} Cadence <b>${cooldownOf(s).toFixed(2)} s</b></span>`;
    const ll = this.body.querySelector('.luckline')!;
    if (ll.innerHTML !== line) ll.innerHTML = line;

    const p = rarityChances(luck);
    const runes = runesOf(this.family);
    RARITIES.forEach((_, i) => {
      const cell = this.body.querySelector(`[data-p="${i}"]`)!;
      const t = oddsLabel(p[i]);
      if (cell.textContent !== t) cell.textContent = t;
      const def = runes[i];
      const n = s.runes[def.id] ?? 0;
      const found = n > 0 || (s.runeStats.best >= i && false);
      const nm = this.body.querySelector(`[data-n="${i}"]`)!;
      const nmHtml = found ? `${def.name} <b>×${formatNumber(n)}</b>` : '<i>inconnue</i>';
      if (nm.innerHTML !== nmHtml) {
        nm.innerHTML = nmHtml;
        (nm.previousElementSibling as HTMLElement).innerHTML = runeIcon(def, found, 26);
      }
      const ef = this.body.querySelector(`[data-e="${i}"]`)!;
      const efTxt = found ? runeEffect(def, n) : statText(def.stat, def.value) + ' par copie';
      if (ef.textContent !== efTxt) ef.textContent = efTxt;
    });

    this.body.querySelectorAll<HTMLElement>('.altar-up').forEach((row) => {
      const id = row.dataset.up as 'luck' | 'bulk' | 'speed' | 'auto';
      const u = altarUpgrade(id);
      const lvl = altarLevel(s, id);
      const c = altarUpgradeCost(s, id);
      const own = row.querySelector('.own')!;
      const ownTxt = id === 'auto' ? (s.altar.auto ? 'acquis' : '') : lvl > 0 ? `niv. ${lvl}` : '';
      if (own.textContent !== ownTxt) own.textContent = ownTxt;
      const sealEl = row.querySelector('.seal') as HTMLElement;
      if (!c) {
        setSeal(sealEl, { label: 'Maximum', price: ICONS.check, ok: false });
        return;
      }
      const okUp = (c.shards ?? 0) <= s.shards && (c.lumen ?? 0) <= s.lumen && (id !== 'auto' || s.zones.forge);
      setSeal(sealEl, { label: 'Améliorer', price: costHtml(c), note: id === 'auto' && !s.zones.forge ? 'après les Forges' : '', ok: okUp, progress: 0 });
      void u;
    });
    void ROLL;
    void this.lastRolled;
    void formatDuration;
  }

  private indexHtml(): string {
    const s = this.getState();
    const found = RUNES.filter((r) => (s.runes[r.id] ?? 0) > 0).length;
    return `
      <p class="note">${found} / ${RUNES.length} runes trouvées. Les doublons s’additionnent (avec un rendement décroissant). Les runes <b>légendaires et plus rares</b> survivent à la descente de l’île.</p>
      <div class="bonus-sum"></div>
      ${FAMILY_ORDER.map((f) => {
        const fam = FAMILIES[f];
        const open = familyUnlocked(s, f);
        return `<div class="section-title" style="color:${fam.css}">${fam.name}${open ? '' : ' · île non atteinte'}</div>
          <div class="rune-grid">${runesOf(f)
            .map((def) => {
              const n = s.runes[def.id] ?? 0;
              const r = RARITIES[RARITY_INDEX[def.rarity]];
              return `<div class="rune-tile ${n ? 'got' : ''}" title="${n ? `${def.name} — ${runeEffect(def, n)}` : `${r.name} · ${oddsLabel(1 / r.oneIn)}`}">${runeIcon(def, n > 0, 46)}<div class="rt-name">${n ? def.name : '???'}</div><div class="rt-rar" style="color:${r.css}">${r.name}</div><div class="rt-n">${n ? '×' + formatNumber(n) : ''}</div></div>`;
            })
            .join('')}</div>`;
      }).join('')}`;
  }

  private updateIndex(): void {
    const r = this.getRates();
    const b = r.bonus;
    const stats: RuneStat[] = ['prod', 'click', 'lumen', 'speed', 'crit', 'luck', 'offline', 'cost', 'seeds', 'bulk'];
    const html = stats
      .filter((k) => b[k] > 0)
      .map((k) => `<span class="${STAT_CAP[k] !== undefined && b[k] >= STAT_CAP[k]! - 1e-9 ? 'capped' : ''}">${statText(k, b[k])}</span>`)
      .join('');
    const el2 = this.body.querySelector('.bonus-sum');
    const full = html ? `<b>Bonus actifs (runes + succès)</b>${html}` : '<i>Aucun bonus pour l’instant.</i>';
    if (el2 && el2.innerHTML !== full) el2.innerHTML = full;
  }
}

/** Full-screen announcement for rare drops (legendary and above), or a ribbon for epics. */
export class Celebration {
  readonly el = el('div', 'celebrate');
  private timer: number | null = null;

  constructor(parent: HTMLElement) {
    parent.appendChild(this.el);
  }

  show(def: RuneDef, count: number): void {
    const r = RARITIES[RARITY_INDEX[def.rarity]];
    this.el.className = `celebrate on r${RARITY_INDEX[def.rarity]}`;
    this.el.style.setProperty('--rar', r.css);
    this.el.innerHTML = `<div class="rays"><svg viewBox="0 0 900 900"><defs><radialGradient id="rf"><stop offset="0" stop-color="currentColor" stop-opacity=".75"/><stop offset=".55" stop-color="currentColor" stop-opacity=".25"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><path fill="url(#rf)" d="M450 450L900 450L896 508zM450 450L866 622L840 675zM450 450L768 768L724 807zM450 450L622 866L567 885zM450 450L450 900L392 896zM450 450L278 866L225 840zM450 450L132 768L93 724zM450 450L34 622L15 567zM450 450L0 450L4 392zM450 450L34 278L60 225zM450 450L132 132L176 93zM450 450L278 34L333 15zM450 450L450 0L508 4zM450 450L622 34L675 60zM450 450L768 132L807 176zM450 450L866 278L885 333z"/></svg></div><div class="card vellum"><div class="kicker">Rune ${r.name.toLowerCase()} !</div>${runeIcon(def, true, 120)}<div class="title">${def.name}</div><div class="eff">${runeEffect(def, 1)} par copie</div><div class="odds">Chance de base : ${oddsLabel(1 / r.oneIn)}${count > 1 ? ` · tu en as ${count}` : ''}</div></div>`;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove('on'), r.celebrate >= 4 ? 4200 : 3000);
  }
}
