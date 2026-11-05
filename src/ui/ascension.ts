/** Ascension panel: the second layer (rise above the clouds), Relics and Challenges. */
import { ASCENSION, CHALLENGES, RELICS, type ChallengeId, type RelicId } from '../config/ascension';
import { canAscend, challengesUnlocked, crownGain, crownsFree, cycleSeeds, hasRelic } from '../economy/ascension';
import { islandThreshold } from '../economy/economy';
import { formatNumber } from '../economy/format';
import type { GameState } from '../economy/state';
import { ICONS } from './icons';
import { framePanel } from './panels';

export interface AscensionActions {
  ascend(): void;
  buyRelic(id: RelicId): boolean;
  startChallenge(id: ChallengeId): void;
  abandonChallenge(): void;
  toggleAutoPrestige(): void;
  sound(k: 'tab' | 'hover'): void;
}

type Tab = 'rise' | 'relics' | 'challenges';

export class AscensionPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private tab: Tab = 'rise';
  private sig = '';
  private armed: ChallengeId | 'ascend' | null = null;

  constructor(
    private actions: AscensionActions,
    private getState: () => GameState,
  ) {
    this.el = framePanel('modal wide ascension', 'crown', 'Ascension', 'Au-dessus des nuages');
    this.el.insertAdjacentHTML('beforeend', `<div class="tabs"><button class="tab on" data-tab="rise">Ascension</button><button class="tab" data-tab="relics">Reliques</button><button class="tab" data-tab="challenges">Défis</button></div><div class="body"></div>`);
    this.body = this.el.querySelector('.body')!;
    this.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        this.actions.sound('tab');
        this.armed = null;
        this.sig = '';
        this.refresh();
      }),
    );
    this.body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      const a = t.dataset.act;
      const id = t.dataset.id;
      if (a === 'ascend') {
        // Two clicks: it resets a lot.
        if (this.armed !== 'ascend') this.armed = 'ascend';
        else {
          this.armed = null;
          this.actions.ascend();
        }
      } else if (a === 'relic') this.actions.buyRelic(id as RelicId);
      else if (a === 'challenge') {
        if (this.armed !== id) this.armed = id as ChallengeId;
        else {
          this.armed = null;
          this.actions.startChallenge(id as ChallengeId);
        }
      } else if (a === 'abandon') this.actions.abandonChallenge();
      else if (a === 'auto') this.actions.toggleAutoPrestige();
      this.sig = '';
      this.refresh();
    });
  }

  open(tab?: Tab): void {
    if (tab) {
      this.tab = tab;
      this.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    }
    this.armed = null;
    this.sig = '';
    this.refresh();
  }

  refresh(): void {
    const s = this.getState();
    const a = s.ascension;
    const sig = this.tab + this.armed + Math.floor(cycleSeeds(s)) + a.crowns + a.crownsSpent + Object.keys(a.relics).join() + a.challenge + Object.keys(a.done).join() + a.autoPrestige + Math.floor(s.stats.runShards / Math.max(1, islandThreshold(s)) * 50);
    if (sig === this.sig) return;
    this.sig = sig;
    this.body.innerHTML = this.tab === 'rise' ? this.riseHtml(s) : this.tab === 'relics' ? this.relicsHtml(s) : this.challengesHtml(s);
  }

  private head(s: GameState): string {
    return `<div class="crown-head">${ICONS.crown}<div><b>${s.ascension.crowns}</b> couronne${s.ascension.crowns > 1 ? 's' : ''} d’éther · <b>${crownsFree(s)}</b> à dépenser<br><span class="note">Chaque couronne : +${Math.round(ASCENSION.crownProd * 100)} % de production et +${Math.round(ASCENSION.crownLuck * 100)} % de chance, pour toujours.</span></div></div>`;
  }

  private riseHtml(s: GameState): string {
    const c = cycleSeeds(s);
    const gain = crownGain(s);
    const ok = canAscend(s);
    const pct = Math.min(100, (c / ASCENSION.seeds) * 100);
    return `${this.head(s)}
      <p class="note">Quand tu as gagné <b>${formatNumber(ASCENSION.seeds)} graines d’étoile</b> depuis ta dernière Ascension, l’archipel tout entier peut s’élever au-dessus des nuages. Tu recommences de zéro, plus fort, et deux nouvelles mécaniques s’ouvrent : les <b>reliques</b> et les <b>défis</b>.</p>
      <div class="asc-progress"><div class="msbar big"><i style="width:${pct}%;background:var(--gold)"></i></div><span><b>${formatNumber(c)}</b> / ${formatNumber(ASCENSION.seeds)} graines ce cycle</span></div>
      ${ok ? `<div class="big-gain"><div class="gold">${ICONS.crown}+${gain}</div></div>` : ''}
      <div class="compare">
        <div class="lose"><h4>Tu perds</h4>Graines d’étoile et talents<br>Constellations<br>Runes sauf mythiques et célestes<br>Fragments, améliorations d’autel<br>L’île en cours</div>
        <div class="keep"><h4>Tu gardes</h4>Couronnes et reliques<br>Défis réussis<br>Familiers et leurs niveaux<br>Runes mythiques et célestes<br>Succès et statistiques</div>
      </div>
      ${s.ascension.challenge ? '<p class="note warn">Termine ou abandonne ton défi avant de t’élever.</p>' : ''}
      <div class="row-btns"><button class="pill-btn gold-btn ${this.armed === 'ascend' ? 'armed' : ''}" data-act="ascend" ${ok ? '' : 'disabled'}>${this.armed === 'ascend' ? 'Vraiment ? Clique encore pour t’élever' : `S’élever au-dessus des nuages${ok ? ` (+${gain} couronnes)` : ''}`}</button></div>`;
  }

  private relicsHtml(s: GameState): string {
    if (s.ascension.count === 0) return `${this.head(s)}<div class="empty">Les reliques s’achètent avec les couronnes de ta première Ascension.</div>`;
    return `${this.head(s)}<p class="note">Une relique ne donne pas un pourcentage : elle change une règle du jeu, pour toujours.</p>
      ${RELICS.map((r) => {
        const own = hasRelic(s, r.id);
        const ok = !own && crownsFree(s) >= r.cost;
        return `<div class="row relic ${own ? 'owned' : ''}"><div class="medal gold">${ICONS.crown}</div><div class="row-main"><div class="row-title"><span class="nm">${r.name}</span>${own ? '<span class="tag on">possédée</span>' : ''}</div><div class="meta">${r.desc}</div>
          ${own && r.id === 'autoPrestige' ? `<button class="pill-btn small ${s.ascension.autoPrestige ? 'primary' : ''}" data-act="auto">${s.ascension.autoPrestige ? 'Actif' : 'En pause'}</button>` : ''}</div>
          ${own ? `<div class="tcost done">${ICONS.check}</div>` : `<button class="seal ${ok ? '' : 'no'}" data-act="relic" data-id="${r.id}"><span class="lbl">Acquérir</span><span class="price">${ICONS.crown}${r.cost}</span><small></small><i class="fill"></i></button>`}</div>`;
      }).join('')}`;
  }

  private challengesHtml(s: GameState): string {
    if (!challengesUnlocked(s)) return `${this.head(s)}<div class="empty">Les défis s’ouvrent avec ta première Ascension.</div>`;
    const cur = s.ascension.challenge;
    return `${this.head(s)}<p class="note">Un défi fait recommencer l’île en cours sous une contrainte (sans gagner de graines). Éveille le Phare malgré elle pour gagner une récompense <b>permanente</b>.</p>
      ${cur ? `<div class="challenge-now">Défi en cours : <b>${CHALLENGES.find((c) => c.id === cur)!.name}</b> · Phare : ${formatNumber(s.stats.runShards)} / ${formatNumber(islandThreshold(s))} <button class="pill-btn small danger" data-act="abandon">Abandonner</button></div>` : ''}
      ${CHALLENGES.map((c) => {
        const done = !!s.ascension.done[c.id];
        const now = cur === c.id;
        return `<div class="row challenge ${done ? 'owned' : ''}"><div class="medal ${done ? 'gold' : ''}">${done ? ICONS.trophy : ICONS.lock}</div><div class="row-main"><div class="row-title"><span class="nm">${c.name}</span>${done ? '<span class="tag on">réussi</span>' : now ? '<span class="tag away">en cours</span>' : ''}</div><div class="meta">${c.rule}<br><b>Récompense :</b> ${c.reward}</div></div>
          ${done || now || cur ? '<div></div>' : `<button class="seal ${this.armed === c.id ? 'go' : ''}" data-act="challenge" data-id="${c.id}"><span class="lbl">${this.armed === c.id ? 'Confirmer ?' : 'Relever'}</span><span class="price">${ICONS.crown}</span><small>${this.armed === c.id ? 'l’île recommence' : ''}</small><i class="fill"></i></button>`}</div>`;
      }).join('')}`;
  }
}
