/** Nid d'éther: hatch eggs, level familiars, choose who strikes the crystal. */
import { PET_RARITIES, PETS, SPECIES, type SpeciesId } from '../config/familiars';
import type { Rates } from '../economy/economy';
import { canBuyEgg, eggCost, levelCost, perchCount, perched, petPower } from '../economy/familiars';
import { formatNumber, formatRate } from '../economy/format';
import type { GameState, Pet } from '../economy/state';
import { costHtml } from './hud';
import { ICONS } from './icons';
import { framePanel, seal, setSeal } from './panels';

export interface FamiliarActions {
  buyEgg(): boolean;
  hatch(): boolean;
  levelUp(id: number): boolean;
  togglePerch(id: number): boolean;
  sound(k: 'tab' | 'hover'): void;
}

export function speciesIcon(sp: SpeciesId): string {
  return ICONS[sp];
}

export class FamiliarPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private sig = '';

  constructor(
    private actions: FamiliarActions,
    private getState: () => GameState,
    private getRates: () => Rates,
  ) {
    this.el = framePanel('drawer familiars', 'egg', 'Nid d’éther', 'Tes familiers frappent le cristal pour toi');
    this.el.insertAdjacentHTML('beforeend', '<div class="body"></div>');
    this.body = this.el.querySelector('.body')!;
    this.body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      const act = t.dataset.act!;
      const id = Number(t.dataset.id);
      let ok = false;
      if (act === 'egg') ok = this.actions.buyEgg();
      else if (act === 'hatch') ok = this.actions.hatch();
      else if (act === 'level') ok = this.actions.levelUp(id);
      else if (act === 'perch') ok = this.actions.togglePerch(id);
      if (ok && act === 'level') {
        const row = t.closest('.row') as HTMLElement | null;
        row?.classList.remove('stamp');
        void row?.offsetWidth;
        row?.classList.add('stamp');
      }
      this.refresh();
    });
  }

  refresh(): void {
    const s = this.getState();
    const sig = s.pets.map((p) => `${p.id}.${p.level}.${p.perched ? 1 : 0}${p.away ? 'a' : ''}`).join(',') + '|' + s.eggs + '|' + s.eggsBought + '|' + perchCount(s);
    if (sig !== this.sig) {
      const first = this.sig === '';
      const scroll = this.body.scrollTop;
      this.sig = sig;
      this.build(s);
      if (!first) {
        this.body.scrollTop = scroll;
        this.body.querySelectorAll<HTMLElement>('.row').forEach((r) => (r.style.animation = 'none'));
      }
    }
    this.update(s, this.getRates());
  }

  /** Forget the layout (next refresh rebuilds with the cascade animation). */
  reset(): void {
    this.sig = '';
  }

  private build(s: GameState): void {
    const n = perched(s).length;
    const head = `<div class="nest-head">
        <div class="eggs">${ICONS.egg}<div><b class="eggn">${s.eggs}</b> œuf${s.eggs > 1 ? 's' : ''} au nid<br><span class="note">Perchoirs : <b>${n} / ${perchCount(s)}</b> familiers frappent le cristal</span></div></div>
        <div class="nest-btns">
          <button class="pill-btn primary ${s.eggs > 0 ? '' : 'off'}" data-act="hatch" ${s.eggs > 0 ? '' : 'disabled'}>Faire éclore</button>
          <div class="egg-buy">${seal('egg')}</div>
        </div>
      </div>
      <p class="note">Un familier frappe le cristal à intervalles réguliers, pour une part de la valeur d’un coup de pioche (même quand tu ne joues pas). Les plus rares frappent plus fort. Ils te suivent d’île en île.</p>`;
    const rows = s.pets
      .slice()
      .sort((a, b) => Number(b.perched) - Number(a.perched) || PET_RARITIES.findIndex((r) => r.id === b.rarity) - PET_RARITIES.findIndex((r) => r.id === a.rarity) || b.level - a.level)
      .map((p) => this.rowHtml(s, p))
      .join('');
    this.body.innerHTML = head + (rows ? `<div class="section-title">Familiers · ${s.pets.length}/${PETS.maxOwned}</div>${rows}` : '<div class="empty">Aucun familier pour l’instant.<br>Fais éclore un œuf !</div>');
    this.body.querySelectorAll<HTMLElement>('.row').forEach((r, i) => (r.style.animationDelay = `${i * 40}ms`));
    const egg = this.body.querySelector('.seal.egg') as HTMLElement;
    egg.dataset.act = 'egg';
    egg.addEventListener('mouseenter', () => this.actions.sound('hover'));
  }

  private rowHtml(_s: GameState, p: Pet): string {
    const sp = SPECIES[p.species];
    const rd = PET_RARITIES.find((r) => r.id === p.rarity)!;
    const state = p.away ? '<span class="tag away">en expédition</span>' : p.perched ? '<span class="tag on">perché</span>' : '<span class="tag">au repos</span>';
    return `<div class="row pet ${p.perched && !p.away ? '' : 'locked-soft'}" data-pet="${p.id}">
      <div class="medal pet-medal" style="--rc:${rd.css}">${speciesIcon(p.species)}</div>
      <div class="row-main"><div class="row-title"><span class="nm">${sp.name}</span><span class="rar" style="color:${rd.css}">${rd.name}</span><span class="own">niv. ${p.level}</span>${state}</div>
      <div class="yield"></div>
      <div class="meta">${sp.trait}</div>
      <div class="pet-btns">${p.away ? '' : `<button class="pill-btn small" data-act="perch" data-id="${p.id}">${p.perched ? 'Faire descendre' : 'Percher'}</button>`}</div></div>
      ${seal('lvl')}</div>`;
  }

  private update(s: GameState, r: Rates): void {
    const eggBtn = this.body.querySelector('.seal.egg') as HTMLElement | null;
    if (eggBtn) {
      const c = eggCost(s);
      const full = s.pets.length + s.eggs >= PETS.maxOwned;
      setSeal(eggBtn, { label: 'Acheter un œuf', price: costHtml(c), note: full ? 'nid plein' : '', ok: canBuyEgg(s), progress: Math.min(1, (s.lumen || 0) / (c.lumen ?? 1)) });
    }
    for (const p of s.pets) {
      const row = this.body.querySelector<HTMLElement>(`[data-pet="${p.id}"]`);
      if (!row) continue;
      const pw = petPower(s, p, r.bonus.pet);
      const per = SPECIES[p.species].period;
      const y = row.querySelector('.yield')!;
      const yh = `+${formatRate((pw * r.click) / per)} ${ICONS.shard}/s<small>${formatNumber(pw, 2)}× un coup toutes les ${String(per).replace('.', ',')} s</small>`;
      if (y.innerHTML !== yh) y.innerHTML = yh;
      const sl = row.querySelector('.seal.lvl') as HTMLElement;
      sl.dataset.act = 'level';
      sl.dataset.id = String(p.id);
      const c = levelCost(p);
      if (!c) setSeal(sl, { label: 'Niveau max', price: ICONS.check, ok: false });
      else {
        const ok = (c.lumen ?? 0) <= s.lumen && (c.shards ?? 0) <= s.shards;
        setSeal(sl, { label: `Niveau ${p.level + 1}`, price: costHtml(c), ok, progress: Math.min(1, s.lumen / (c.lumen ?? 1)) });
      }
    }
  }
}
