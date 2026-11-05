/** Journal: achievements (tiered, permanent bonuses), statistics and constellations (long-term goal). */
import { ACH_CATEGORIES, ACHIEVEMENTS, TIER_NAMES, TOTAL_TIERS, distinctRunes, type AchCategory, type AchievementDef } from '../config/achievements';
import { CONSTELLATIONS } from '../config/constellations';
import { RARITIES, RUNES, type RuneStat } from '../config/runes';
import { achievementTotals, tiersUnlocked } from '../economy/achievements';
import { formatDuration, formatNumber } from '../economy/format';
import type { GameState } from '../economy/state';
import { el } from './hud';
import { ICONS } from './icons';
import { framePanel } from './panels';
import { statText } from './runes';

/** Goal of tier `i` written for the player. */
export function goalText(def: AchievementDef, i: number): string {
  const g = def.goals[Math.min(i, def.goals.length - 1)];
  switch (def.fmt) {
    case 'time':
      return formatDuration(g);
    case 'dist':
      return g >= 1000 ? `${formatNumber(g / 1000)} km` : `${g} m`;
    case 'rarity':
      return RARITIES[g].name.toLowerCase();
    default:
      return formatNumber(g);
  }
}

export function achievementDesc(def: AchievementDef, i: number): string {
  return def.desc.replace('{n}', goalText(def, i));
}

function measureText(def: AchievementDef, v: number): string {
  if (def.fmt === 'time') return v > 0 ? formatDuration(v) : '—';
  if (def.fmt === 'dist') return v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${Math.floor(v)} m`;
  if (def.fmt === 'rarity') return v >= 0 ? RARITIES[v].name.toLowerCase() : '—';
  return formatNumber(Math.floor(v));
}

const MEDAL = ['', 'bronze', 'silver', 'gold'];

type Tab = 'ach' | 'stats' | 'const';

export class Journal {
  readonly el: HTMLElement;
  private tab: Tab = 'ach';
  private cat: AchCategory | 'all' = 'all';
  private body: HTMLElement;
  private sig = '';

  constructor(
    private getState: () => GameState,
    private sound: (k: 'tab') => void,
  ) {
    this.el = framePanel('drawer journal', 'trophy', 'Journal', 'Succès, statistiques, constellations');
    this.el.insertAdjacentHTML('beforeend', `<div class="tabs"><button class="tab on" data-tab="ach">Succès</button><button class="tab" data-tab="stats">Statistiques</button><button class="tab" data-tab="const">Constellations</button></div><div class="body"></div>`);
    this.body = this.el.querySelector('.body')!;
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        this.sig = '';
        this.sound('tab');
        this.refresh();
      }),
    );
    // Category chips are rebuilt with the body: delegate clicks.
    this.body.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-cat]');
      if (!chip) return;
      this.cat = chip.dataset.cat as AchCategory | 'all';
      this.sig = '';
      this.sound('tab');
      this.refresh();
    });
  }

  /** Open directly on the achievements of a category. */
  focus(tab: Tab, cat: AchCategory | 'all' = 'all'): void {
    this.tab = tab;
    this.cat = cat;
    this.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    this.sig = '';
    this.refresh();
  }

  refresh(): void {
    const s = this.getState();
    const sig =
      this.tab +
      this.cat +
      tiersUnlocked(s) +
      '|' +
      s.lifetimeSeeds +
      '|' +
      (this.tab === 'stats' ? Math.floor(s.stats.playSeconds / 2) : Math.floor(Math.log2(1 + s.stats.allTimeShards) * 4) + s.counters.jumps + Math.floor(s.counters.distance / 20) + s.stats.allTimeHarvests);
    if (sig === this.sig) return;
    const first = this.sig === '' || this.sig.slice(0, 4) !== sig.slice(0, 4);
    this.sig = sig;
    const scroll = this.body.scrollTop;
    this.body.innerHTML = '';
    if (this.tab === 'ach') this.buildAchievements(s, first);
    else if (this.tab === 'stats') this.buildStats(s);
    else this.buildConstellations(s);
    if (!first) this.body.scrollTop = scroll;
    if (!first) this.body.querySelectorAll<HTMLElement>('.row').forEach((r) => (r.style.animation = 'none'));
  }

  private buildAchievements(s: GameState, cascade: boolean): void {
    const got = tiersUnlocked(s);
    const tot = achievementTotals(s);
    const bonus = (Object.keys(tot) as RuneStat[]).filter((k) => tot[k] > 0).map((k) => statText(k, tot[k]));
    const head = el('div', 'ach-head');
    head.innerHTML = `<div class="ach-count"><b>${got}</b><span>/ ${TOTAL_TIERS} paliers</span></div>
      <div class="ach-bonus"><span class="tag">Bonus permanents</span>${bonus.length ? bonus.join(' · ') : 'Aucun pour l’instant : chaque palier en donne un.'}</div>`;
    this.body.appendChild(head);

    const chips = el('div', 'chips');
    const counts = (c: AchCategory | 'all') => {
      const list = ACHIEVEMENTS.filter((a) => c === 'all' || a.cat === c);
      return `${list.reduce((n, a) => n + (s.achievements[a.id] ?? 0), 0)}/${list.reduce((n, a) => n + a.goals.length, 0)}`;
    };
    chips.innerHTML = [{ id: 'all', name: 'Tous' }, ...ACH_CATEGORIES].map((c) => `<button class="chip ${this.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.name}<small>${counts(c.id as AchCategory | 'all')}</small></button>`).join('');
    this.body.appendChild(chips);

    const list = ACHIEVEMENTS.filter((a) => this.cat === 'all' || a.cat === this.cat);
    // Closest to the next tier first, completed ones last, hidden ones at the very end.
    const rank = (a: AchievementDef) => {
      const t = s.achievements[a.id] ?? 0;
      if (a.secret && t === 0) return 3;
      if (t >= a.goals.length) return 2;
      return 1 - this.progress(a, s);
    };
    list.sort((x, y) => rank(x) - rank(y));
    list.forEach((a, i) => {
      const t = s.achievements[a.id] ?? 0;
      const done = t >= a.goals.length;
      const hidden = a.secret && t === 0;
      const v = a.value(s);
      const pct = done ? 100 : this.progress(a, s) * 100;
      const pips = a.goals.length > 1 ? `<span class="pips">${a.goals.map((_, k) => `<i class="${k < t ? MEDAL[k + 1] : ''}"></i>`).join('')}</span>` : '';
      const nextTxt = hidden ? 'Un geste particulier débloque ce succès.' : done ? achievementDesc(a, a.goals.length - 1) : achievementDesc(a, t);
      const meas = !hidden && !done && (a.goals.length > 1 || a.fmt) && !a.secret ? ` · <b>${measureText(a, v)}</b>${a.lower ? '' : ` / ${goalText(a, t)}`}` : '';
      const reward = hidden ? '?' : done ? statText(a.stat, a.values.reduce((x, y) => x + y, 0)) : statText(a.stat, a.values[t]);
      const tierName = t > 0 && a.goals.length > 1 ? `<span class="tier ${MEDAL[t]}">${TIER_NAMES[t - 1]}</span>` : '';
      const row = el(
        'div',
        `row ach ${done ? 'done' : ''} ${t === 0 ? 'locked-soft' : ''}`,
        `<div class="medal ${MEDAL[t]}">${hidden ? ICONS.lock : ICONS.trophy}</div>
         <div class="row-main"><div class="row-title"><span class="nm">${hidden ? 'Succès secret' : a.name}</span>${tierName}${pips}</div>
         <div class="meta">${nextTxt}${meas}</div>
         ${!done && !hidden ? `<div class="msbar"><i style="width:${pct}%"></i></div>` : ''}</div>
         <div class="reward ${done ? 'on' : ''}">${done ? '' : '<small>prochain palier</small>'}${reward}</div>`,
      );
      if (cascade) row.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
      this.body.appendChild(row);
    });
  }

  /** 0..1 progress towards the next tier of `a`. */
  private progress(a: AchievementDef, s: GameState): number {
    const t = s.achievements[a.id] ?? 0;
    if (t >= a.goals.length) return 1;
    const v = a.value(s);
    const g = a.goals[t];
    if (a.lower) return v > 0 ? Math.min(1, g / v) : 0;
    if (a.fmt === 'rarity') return Math.max(0, (v + 1) / (g + 1));
    // Logarithmic for huge goals so the bar moves.
    if (g >= 1000) return Math.max(0, Math.min(1, Math.log10(1 + v) / Math.log10(1 + g)));
    return Math.max(0, Math.min(1, v / g));
  }

  private buildStats(s: GameState): void {
    const st = s.stats;
    const ct = s.counters;
    const byRarity = RARITIES.map((r) => {
      const n = RUNES.filter((x) => x.rarity === r.id).reduce((a, x) => a + (s.runes[x.id] ?? 0), 0);
      return `<span>${r.name}</span><b style="color:${r.css}">${formatNumber(n)}</b>`;
    }).join('');
    const sec = (title: string, rows: [string, string][]) => `<div class="section-title">${title}</div><div class="stats-grid">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
    const html =
      sec('Temps', [
        ['Temps de jeu', formatDuration(st.playSeconds)],
        ['Sur cette île', formatDuration(st.runSeconds)],
        ['Île la plus rapide', ct.bestIsland > 0 ? formatDuration(ct.bestIsland) : '—'],
        ['Nuits passées', formatNumber(ct.nights)],
      ]) +
      sec('Ressources', [
        ['Éclats sur cette île', formatNumber(st.runShards)],
        ['Éclats au total', formatNumber(st.allTimeShards)],
        ['Lumen au total', formatNumber(st.allTimeLumen)],
        ['Record de production', `${formatNumber(ct.bestRate)} /s`],
        ['Graines d’étoile', `${formatNumber(s.seeds)} (${formatNumber(s.lifetimeSeeds)} au total)`],
        ['Îles descendues', formatNumber(st.prestiges)],
        ['Plus grosse descente', `${formatNumber(ct.bestGain)} graines`],
      ]) +
      sec('Pioche', [
        ['Coups de pioche', formatNumber(st.allTimeHarvests)],
        ['Coups critiques', formatNumber(ct.crits)],
        ['Plus longue série', formatNumber(ct.bestCombo)],
        ['Meilleur coup', `${formatNumber(ct.bestHit)} éclats`],
      ]) +
      sec('Runes', [
        ['Tirages', formatNumber(s.runeStats.rolls)],
        ['Runes obtenues', formatNumber(s.runeStats.runes)],
        ['Runes découvertes', `${distinctRunes(s)} / ${RUNES.length}`],
        ['Meilleure rareté', s.runeStats.best >= 0 ? RARITIES[s.runeStats.best].name : '—'],
        ['Tirages de nuit', formatNumber(ct.nightRolls)],
        ['Fusions', formatNumber(ct.fusions)],
      ]) +
      `<div class="stats-grid rarities">${byRarity}</div>` +
      sec('Événements', [
        ['Événements vus', formatNumber(ct.eventsSeen)],
        ['Météores ramassés', formatNumber(ct.meteors)],
        ['Cristaux dorés brisés', formatNumber(ct.golden)],
        ['Gardiens vaincus', formatNumber(ct.guardians)],
        ['Gardien le plus rapide', ct.guardFast > 0 ? formatDuration(ct.guardFast) : '—'],
        ['Failles refermées', formatNumber(ct.rifts)],
        ['Achats au marchand', formatNumber(ct.merchant)],
      ]) +
      sec('Exploration', [
        ['Distance parcourue', ct.distance >= 1000 ? `${(ct.distance / 1000).toFixed(2)} km` : `${Math.floor(ct.distance)} m`],
        ['Sauts', formatNumber(ct.jumps)],
        ['Familiers', formatNumber(ct.pets)],
        ['Expéditions', formatNumber(ct.expeditions)],
      ]);
    this.body.insertAdjacentHTML('beforeend', `<p class="note">Tout ce que tu as accompli depuis ta toute première île.</p>${html}`);
  }

  private buildConstellations(s: GameState): void {
    const ls = s.lifetimeSeeds;
    this.body.appendChild(el('p', 'note', `Graines d’étoile gagnées au total : <b>${formatNumber(ls)}</b>. Chaque constellation allumée rend <b>toutes les îles suivantes</b> plus fortes. C’est l’objectif de long terme après le premier prestige.`));
    const sky = el('div', 'const-sky');
    CONSTELLATIONS.forEach((c, i) => {
      const on = ls >= c.seeds;
      sky.insertAdjacentHTML('beforeend', `<span class="cstar ${on ? 'on' : ''}" style="left:${8 + i * 14}%;top:${30 + Math.sin(i * 1.7) * 22}%">${ICONS.seed}</span>`);
    });
    this.body.appendChild(sky);
    CONSTELLATIONS.forEach((c, i) => {
      const on = ls >= c.seeds;
      const row = el(
        'div',
        `row ${on ? '' : 'locked-soft'}`,
        `<div class="medal ${on ? 'violet' : ''}">${ICONS.seed}</div>
         <div class="row-main"><div class="row-title"><span class="nm">${c.name}</span><span class="own">${formatNumber(c.seeds)} graines</span></div>
         <div class="meta">${c.desc}</div>${on ? '' : `<div class="msbar"><i style="width:${Math.min(100, (ls / c.seeds) * 100)}%;background:var(--violet)"></i></div>`}</div>
         <div class="reward ${on ? 'on violet' : ''}">${on ? 'Allumée' : 'Éteinte'}</div>`,
      );
      row.style.animationDelay = `${i * 40}ms`;
      this.body.appendChild(row);
    });
  }
}
