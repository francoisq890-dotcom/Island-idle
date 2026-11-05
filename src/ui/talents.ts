/**
 * Jardin d'étoiles: three branches drawn as engraved vines on the vellum, one
 * medallion per talent, ink lines between them. Planting a seed stamps the node.
 */
import { BRANCHES, TALENT, TALENTS, type TalentDef } from '../config/talents';
import { formatDuration, formatNumber } from '../economy/format';
import { canPlant, canRespec, pathChosen, seedsFree, talentCost, talentLock, tlv } from '../economy/talents';
import type { GameState } from '../economy/state';
import { ICONS } from './icons';
import { framePanel } from './panels';

export interface TalentActions {
  plant(id: string): boolean;
  respec(): boolean;
  toggleAutoBuy(): void;
  sound(k: 'tab' | 'hover'): void;
}

export class TalentPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private sig = '';

  constructor(
    private actions: TalentActions,
    private getState: () => GameState,
  ) {
    this.el = framePanel('modal wide talents', 'seed', 'Jardin d’étoiles', 'Plante tes graines d’étoile : elles continuent de compter pour ta production');
    this.el.insertAdjacentHTML('beforeend', '<div class="body"></div>');
    this.body = this.el.querySelector('.body')!;
    this.body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'plant') {
        if (this.actions.plant(t.dataset.id!)) {
          const node = t.closest('.tnode') as HTMLElement;
          node.classList.remove('stamp');
          void node.offsetWidth;
          node.classList.add('stamp');
        }
      } else if (act === 'respec') this.actions.respec();
      else if (act === 'auto') this.actions.toggleAutoBuy();
      this.sig = '';
      this.refresh();
    });
  }

  refresh(): void {
    const s = this.getState();
    const sig = JSON.stringify(s.talents) + s.seeds + '|' + s.seedsPlanted + s.autoBuy + canRespec(s) + s.stats.prestiges;
    if (sig === this.sig) return;
    this.sig = sig;
    const free = seedsFree(s);
    const path = pathChosen(s);
    const head = `<div class="garden-head">
      <div class="seedbox">${ICONS.seed}<div><b>${formatNumber(free)}</b> graine${free > 1 ? 's' : ''} à planter<br><span class="note">${formatNumber(s.seedsPlanted)} plantée${s.seedsPlanted > 1 ? 's' : ''} · toutes comptent pour la production (+${Math.round(s.seeds * 5)} %)</span></div></div>
      <div class="garden-btns">
        ${tlv(s, 'foreman') ? `<button class="pill-btn ${s.autoBuy ? 'primary' : ''}" data-act="auto">Contremaître : ${s.autoBuy ? 'actif' : 'en pause'}</button>` : ''}
        <button class="pill-btn" data-act="respec" ${canRespec(s) ? '' : 'disabled'} title="Gratuit pendant les ${formatDuration(TALENT.respecWindow)} qui suivent la naissance d’une île">Replanter</button>
      </div></div>
      <p class="note">Le dernier talent de chaque branche est une <b>voie</b> : tu n’en choisis qu’une, elle change ta façon de jouer.${path ? ` Voie choisie : <b>${path.name}</b>.` : ''} On peut tout replanter gratuitement au début de chaque île.</p>`;
    const cols = BRANCHES.map((b) => {
      const nodes = TALENTS.filter((t) => t.branch === b.id)
        .map((t) => this.node(s, t))
        .join('');
      return `<div class="branch" style="--bc:${b.css}"><div class="branch-head"><b>${b.name}</b><span>${b.blurb}</span></div>${nodes}</div>`;
    }).join('');
    this.body.innerHTML = head + `<div class="garden">${cols}</div>`;
  }

  private node(s: GameState, t: TalentDef): string {
    const l = tlv(s, t.id);
    const c = talentCost(s, t);
    const lock = talentLock(s, t);
    const ok = canPlant(s, t);
    const done = c === null;
    const cls = `tnode ${t.path ? 'path' : ''} ${l > 0 ? 'on' : ''} ${lock ? 'locked' : ''} ${done ? 'max' : ''}`;
    const pips = t.max > 1 ? `<span class="tpips">${Array.from({ length: t.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>` : '';
    return `<div class="${cls}">
      <div class="tmedal">${t.path ? ICONS.star : ICONS.seed}</div>
      <div class="tmain"><div class="tname">${t.name}${pips}</div><div class="tdesc">${t.desc}${t.max > 1 ? ' (par niveau)' : ''}</div>${lock ? `<div class="tlock">${ICONS.lock}${lock}</div>` : ''}</div>
      ${done ? `<div class="tcost done">${ICONS.check}</div>` : `<button class="tcost ${ok ? '' : 'no'}" data-act="plant" data-id="${t.id}">${ICONS.seed}<b>${c}</b></button>`}
    </div>`;
  }
}
