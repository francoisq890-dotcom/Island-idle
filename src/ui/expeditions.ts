/** Quai des dirigeables (expeditions) and the travelling merchant's stall. */
import { EXPEDITION, EXPEDITIONS } from '../config/expeditions';
import { PET_RARITIES, SPECIES } from '../config/familiars';
import type { Rates } from '../economy/economy';
import { merchantOffers, type OfferId } from '../economy/events2';
import { expeditionsUnlocked, freeSlots, isDone, previewLoot } from '../economy/expeditions';
import { formatDuration, formatNumber } from '../economy/format';
import type { GameState } from '../economy/state';
import { costHtml } from './hud';
import { ICONS } from './icons';
import { framePanel } from './panels';

export interface DockActions {
  start(petId: number, duration: string): boolean;
  claim(index: number): boolean;
  sound(k: 'tab' | 'hover'): void;
}

export class DockPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private sig = '';
  private pet: number | null = null;
  private dur = 'trip';

  constructor(
    private actions: DockActions,
    private getState: () => GameState,
    private getRates: () => Rates,
  ) {
    this.el = framePanel('drawer dock', 'airship', 'Quai des dirigeables', 'Envoie un familier en expédition : il revient chargé de butin');
    this.el.insertAdjacentHTML('beforeend', '<div class="body"></div>');
    this.body = this.el.querySelector('.body')!;
    this.body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      const a = t.dataset.act;
      if (a === 'pet') this.pet = Number(t.dataset.id);
      else if (a === 'dur') this.dur = t.dataset.id!;
      else if (a === 'go' && this.pet !== null) {
        if (this.actions.start(this.pet, this.dur)) this.pet = null;
      } else if (a === 'claim') this.actions.claim(Number(t.dataset.id));
      this.actions.sound('tab');
      this.sig = '';
      this.refresh();
    });
  }

  refresh(): void {
    const s = this.getState();
    const now = Date.now();
    const sig = JSON.stringify(s.expeditions.map((e) => [e.petId, isDone(e, now), Math.floor((e.end - now) / 1000)])) + this.pet + this.dur + s.pets.map((p) => p.id + (p.away ? 'a' : '')).join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    if (!expeditionsUnlocked(s)) {
      this.body.innerHTML = `<div class="empty">Les dirigeables attendent un équipage.<br>Ils s’ouvrent après ta première descente, avec au moins un familier.</div>`;
      return;
    }
    const r = this.getRates();
    const trips = s.expeditions
      .map((e, i) => {
        const p = s.pets.find((x) => x.id === e.petId);
        const done = isDone(e, now);
        const total = e.end - e.start;
        const pct = Math.min(100, ((now - e.start) / total) * 100);
        const d = EXPEDITIONS.find((x) => x.id === e.duration)!;
        return `<div class="row trip ${done ? 'done' : ''}"><div class="medal">${p ? ICONS[p.species] : ICONS.airship}</div>
          <div class="row-main"><div class="row-title"><span class="nm">${d.name}</span><span class="own">${p ? SPECIES[p.species].name : ''}</span></div>
          <div class="meta">${this.lootHtml(e.loot)}</div>
          <div class="msbar"><i style="width:${pct}%;background:var(--violet)"></i></div>
          <div class="meta">${done ? '<b>De retour au quai !</b>' : `retour dans <b>${formatDuration((e.end - now) / 1000)}</b>`}</div></div>
          ${done ? `<button class="seal go" data-act="claim" data-id="${i}"><span class="lbl">Récupérer</span><span class="price">${ICONS.check}</span><small></small><i class="fill"></i></button>` : '<div></div>'}</div>`;
      })
      .join('');
    const avail = s.pets.filter((p) => !p.away);
    if (this.pet !== null && !avail.some((p) => p.id === this.pet)) this.pet = null;
    const petBtns = avail
      .map((p) => {
        const rd = PET_RARITIES.find((x) => x.id === p.rarity)!;
        return `<button class="pet-pick ${this.pet === p.id ? 'on' : ''}" data-act="pet" data-id="${p.id}" style="--rc:${rd.css}" title="${SPECIES[p.species].name} · ${rd.name} · niv. ${p.level}${p.perched ? ' · quittera son perchoir' : ''}">${ICONS[p.species]}<small>niv. ${p.level}</small></button>`;
      })
      .join('');
    const durBtns = EXPEDITIONS.map((d) => `<button class="chip ${this.dur === d.id ? 'on' : ''}" data-act="dur" data-id="${d.id}">${d.name}<small>${formatDuration(d.seconds)}</small></button>`).join('');
    const dDef = EXPEDITIONS.find((x) => x.id === this.dur)!;
    const preview = this.pet !== null ? previewLoot(s, r, this.pet, dDef.seconds) : null;
    const picked = this.pet !== null ? s.pets.find((p) => p.id === this.pet) : null;
    const slots = freeSlots(s);
    this.body.innerHTML = `
      <p class="note">Un familier en expédition quitte son perchoir (il ne frappe plus le cristal) mais revient avec des éclats, du Lumen, des fragments, des runes et parfois un œuf. Les voyages continuent quand le jeu est fermé.</p>
      ${trips ? `<div class="section-title">En voyage · ${s.expeditions.length}/${EXPEDITION.slots}</div>${trips}` : ''}
      <div class="section-title">Nouvelle expédition${slots <= 0 ? ' · aucun dirigeable libre' : ''}</div>
      ${avail.length ? `<div class="pet-picks">${petBtns}</div>` : '<div class="empty">Tous tes familiers sont déjà en voyage.</div>'}
      <div class="chips">${durBtns}</div>
      <div class="trip-preview">${preview ? `${picked && picked.perched ? '<span class="warn">Il quittera son perchoir.</span> ' : ''}Butin attendu : ${this.lootHtml(preview)}` : 'Choisis un familier et une durée.'}</div>
      <div class="row-btns"><button class="pill-btn primary" data-act="go" ${preview && slots > 0 ? '' : 'disabled'}>Larguer les amarres</button></div>`;
  }

  private lootHtml(l: { shards: number; lumen: number; fragments: number; eggChance: number; runes: number }): string {
    return `<span class="loot">${ICONS.shard}${formatNumber(l.shards)}</span> <span class="loot">${ICONS.lumen}${formatNumber(l.lumen)}</span> <span class="loot">${ICONS.fragment}${l.fragments}</span> <span class="loot">${ICONS.rune}${l.runes}</span> <span class="loot">${ICONS.egg}${Math.round(l.eggChance * 100)} %</span>`;
  }
}

export class MerchantPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private bought = new Set<OfferId>();
  timeLeft = 0;

  constructor(
    private buy: (id: OfferId) => boolean,
    private getState: () => GameState,
    private getRates: () => Rates,
  ) {
    this.el = framePanel('modal merchant', 'balloon', 'Le marchand ambulant', 'Il ne reste pas longtemps');
    this.el.insertAdjacentHTML('beforeend', '<div class="body"></div>');
    this.body = this.el.querySelector('.body')!;
    this.body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-offer]');
      if (!t) return;
      const id = t.dataset.offer as OfferId;
      if (!this.bought.has(id) && this.buy(id)) this.bought.add(id);
      this.refresh();
    });
  }

  /** A new visit: everything is on sale again. */
  newVisit(): void {
    this.bought.clear();
  }

  refresh(): void {
    const s = this.getState();
    const offers = merchantOffers(s, this.getRates());
    const icon: Record<OfferId, string> = { egg: ICONS.egg, frags: ICONS.fragment, rune: ICONS.rune };
    this.body.innerHTML = `<p class="note">« Des merveilles des îles lointaines, payables en Lumen ! » Il repart dans <b>${formatDuration(Math.max(0, this.timeLeft))}</b>. Une seule pièce de chaque.</p>
      ${offers
        .map((o) => {
          const sold = this.bought.has(o.id);
          const ok = !sold && o.available && (o.cost.lumen ?? 0) <= s.lumen;
          return `<div class="row offer ${sold || !o.available ? 'locked-soft' : ''}"><div class="medal">${icon[o.id]}</div><div class="row-main"><div class="row-title"><span class="nm">${o.name}</span></div><div class="meta">${o.desc}</div></div>
            <button class="seal ${ok ? '' : 'no'}" data-offer="${o.id}"><span class="lbl">${sold ? 'Vendu' : 'Acheter'}</span><span class="price">${costHtml(o.cost)}</span><small>${!o.available ? 'indisponible' : ''}</small><i class="fill"></i></button></div>`;
        })
        .join('')}`;
  }
}
