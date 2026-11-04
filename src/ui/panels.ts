/** Workshop drawer, menu, offline report and prestige modals. */
import { MACHINES, MACHINE_ORDER, PRESTIGE, UPGRADES, ZONES, ZONE_ORDER, type Cost, type MachineId, type UpgradeDef, type ZoneId } from '../config/economy';
import {
  affordProgress,
  canAfford,
  canUnlockZone,
  machineCost,
  milestoneMult,
  nextMilestone,
  prestigeGain,
  timeToAfford,
  visibleUpgrades,
  type Rates,
} from '../economy/economy';
import { formatDuration, formatNumber, formatRate } from '../economy/format';
import type { OfflineReport } from '../economy/offline';
import type { GameState } from '../economy/state';
import { costHtml, el } from './hud';
import { ICONS, type IconName } from './icons';

export interface PanelActions {
  buyMachine(id: MachineId, n: number): void;
  buyUpgrade(id: string): void;
  unlockZone(id: ZoneId): void;
  goTo(kind: 'site' | 'bridge', key: string): void;
  prestige(): void;
  exportSave(): string;
  importSave(text: string): string | null;
  reset(): void;
  settingsChanged(): void;
  closed(): void;
  sound(kind: 'click' | 'hover'): void;
}

const MACHINE_ICON: Record<MachineId, IconName> = { drill: 'drill', excavator: 'excavator', refinery: 'refinery', geyser: 'geyser', prism: 'prism' };

function waitLabel(t: number): string {
  if (!isFinite(t)) return '';
  if (t <= 0) return '';
  return `dans ${formatDuration(t)}`;
}

function costSum(c: Cost, n: number, id: MachineId, owned: number): Cost {
  const out: Cost = {};
  for (let i = 0; i < n; i++) {
    const k = machineCost(id, owned + i);
    if (k.shards) out.shards = (out.shards ?? 0) + k.shards;
    if (k.lumen) out.lumen = (out.lumen ?? 0) + k.lumen;
  }
  void c;
  return out;
}

/** How many machines can be bought right now (max mode). */
function maxAffordable(state: GameState, id: MachineId): number {
  let s = state.shards;
  let l = state.lumen;
  let n = 0;
  while (n < 1000) {
    const c = machineCost(id, state.machines[id] + n);
    if ((c.shards ?? 0) > s || (c.lumen ?? 0) > l) break;
    s -= c.shards ?? 0;
    l -= c.lumen ?? 0;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------

export class Panels {
  private backdrop = el('div', 'backdrop');
  readonly workshop = el('div', 'panel drawer');
  readonly menu = el('div', 'panel drawer');
  readonly offline = el('div', 'panel modal');
  readonly prestigeModal = el('div', 'panel modal');
  private tab: 'machines' | 'upgrades' = 'machines';
  private buyMode: 1 | 10 | 'max' = 1;
  private wsBody: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private signature = '';
  open: HTMLElement | null = null;
  private upgradeTabBadge: HTMLElement;

  constructor(
    parent: HTMLElement,
    private actions: PanelActions,
    private getState: () => GameState,
    private getRates: () => Rates,
  ) {
    parent.append(this.backdrop, this.workshop, this.menu, this.offline, this.prestigeModal);
    this.backdrop.addEventListener('click', () => this.close());

    // --- Workshop ---------------------------------------------------------------
    this.workshop.innerHTML = `
      <header><h2>${ICONS.hammer} Atelier</h2><button class="close" title="Fermer (Échap)">✕</button></header>
      <div class="tabs">
        <button class="tab on" data-tab="machines">Machines & îles</button>
        <button class="tab" data-tab="upgrades">Améliorations <span class="badge"></span></button>
      </div>
      <div class="tabs buymode" style="padding-top:0">
        <button class="tab on" data-mode="1">×1</button><button class="tab" data-mode="10">×10</button><button class="tab" data-mode="max">Max</button>
      </div>
      <div class="body"></div>`;
    this.wsBody = this.workshop.querySelector('.body')!;
    this.upgradeTabBadge = this.workshop.querySelector('[data-tab="upgrades"] .badge')!;
    this.workshop.querySelector('.close')!.addEventListener('click', () => this.close());
    this.workshop.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as 'machines' | 'upgrades';
        this.workshop.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        (this.workshop.querySelector('.buymode') as HTMLElement).style.display = this.tab === 'machines' ? '' : 'none';
        this.signature = '';
        this.actions.sound('click');
        this.refresh();
      }),
    );
    this.workshop.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.buyMode = b.dataset.mode === 'max' ? 'max' : (Number(b.dataset.mode) as 1 | 10);
        this.workshop.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
        this.actions.sound('click');
        this.refresh();
      }),
    );

    this.buildMenu();
  }

  isOpen(): boolean {
    return !!this.open;
  }

  show(p: HTMLElement): void {
    if (this.open && this.open !== p) this.open.classList.remove('on');
    this.open = p;
    p.classList.add('on');
    this.backdrop.classList.add('on');
    if (p === this.workshop) {
      this.signature = '';
      this.refresh();
    }
    if (p === this.menu) this.refreshMenu();
  }

  close(): void {
    if (!this.open) return;
    this.open.classList.remove('on');
    this.open = null;
    this.backdrop.classList.remove('on');
    this.actions.closed();
  }

  toggleWorkshop(tab?: 'machines' | 'upgrades'): void {
    if (this.open === this.workshop && !tab) return this.close();
    if (tab && tab !== this.tab) (this.workshop.querySelector(`[data-tab="${tab}"]`) as HTMLButtonElement).click();
    this.show(this.workshop);
  }

  // -------------------------------------------------------------------------

  /** Number of upgrades the player can buy right now (HUD badge). */
  affordableUpgrades(): number {
    const s = this.getState();
    return visibleUpgrades(s).filter((u) => canAfford(s, u.cost)).length;
  }

  refresh(): void {
    if (this.open !== this.workshop) return;
    const s = this.getState();
    const r = this.getRates();
    const ups = visibleUpgrades(s).sort((a, b) => (a.cost.shards ?? 0) + (a.cost.lumen ?? 0) * 50 - ((b.cost.shards ?? 0) + (b.cost.lumen ?? 0) * 50));
    const n = ups.filter((u) => canAfford(s, u.cost)).length;
    this.upgradeTabBadge.classList.toggle('on', n > 0);
    this.upgradeTabBadge.textContent = String(n);

    const sig =
      this.tab +
      '|' +
      (this.tab === 'machines' ? ZONE_ORDER.map((z) => (s.zones[z] ? 1 : 0)).join('') + MACHINE_ORDER.map((m) => (s.machines[m] > 0 ? 1 : 0)).join('') : ups.map((u) => u.id).join(','));
    if (sig !== this.signature) {
      this.signature = sig;
      this.cards.clear();
      this.wsBody.innerHTML = '';
      if (this.tab === 'machines') this.buildMachineCards(s);
      else this.buildUpgradeCards(ups);
    }
    if (this.tab === 'machines') this.updateMachineCards(s, r);
    else this.updateUpgradeCards(s, r, ups);
  }

  private buildMachineCards(s: GameState): void {
    this.wsBody.appendChild(el('div', 'section-title', 'Machines'));
    for (const id of MACHINE_ORDER) {
      const def = MACHINES[id];
      if (!s.zones[def.zone]) {
        const lockedHere = ZONE_ORDER.indexOf(def.zone) <= ZONE_ORDER.findIndex((z) => !s.zones[z]) + 0;
        if (!lockedHere) continue;
        const c = el('div', 'card locked', `<div class="icon">${ICONS[MACHINE_ICON[id]]}</div><div class="name">${def.name}</div><div class="desc">Se construit sur l’${ZONES[def.zone].name}. Ouvre d’abord le ${ZONES[def.zone].bridgeName}.</div><div></div>`);
        this.wsBody.appendChild(c);
        continue;
      }
      const c = el(
        'div',
        'card',
        `<div class="icon">${ICONS[MACHINE_ICON[id]]}</div>
         <div class="name">${def.name} <span class="own"></span></div>
         <button class="buy"><span class="lbl"></span><span class="price"></span><small></small><i class="progress"></i></button>
         <div class="desc">${def.blurb}</div>
         <div class="stats"></div>`,
      );
      const buy = c.querySelector('.buy') as HTMLButtonElement;
      buy.addEventListener('click', () => {
        const st = this.getState();
        if (st.machines[id] === 0) {
          this.actions.goTo('site', id);
          return;
        }
        const n = this.buyMode === 'max' ? Math.max(1, maxAffordable(st, id)) : this.buyMode;
        this.actions.buyMachine(id, n);
        c.classList.remove('flash');
        void c.offsetWidth;
        c.classList.add('flash');
      });
      buy.addEventListener('mouseenter', () => this.actions.sound('hover'));
      this.cards.set(id, c);
      this.wsBody.appendChild(c);
    }

    // Zones / bridges.
    const next = ZONE_ORDER.find((z) => !s.zones[z]);
    this.wsBody.appendChild(el('div', 'section-title', 'Expéditions'));
    if (!next) {
      this.wsBody.appendChild(el('div', 'empty', 'Tu as relié toutes les îles de l’archipel. Le Phare t’attend sur l’Île Céleste.'));
      return;
    }
    const z = ZONES[next];
    const c = el(
      'div',
      'card',
      `<div class="icon">${ICONS.bridge}</div>
       <div class="name">${z.bridgeName}</div>
       <button class="buy"><span class="lbl"></span><span class="price"></span><small></small><i class="progress"></i></button>
       <div class="desc">Mène à l’<b>${z.name}</b>. ${z.blurb}</div>
       <div class="stats"></div>`,
    );
    const buy = c.querySelector('.buy') as HTMLButtonElement;
    buy.addEventListener('click', () => {
      const st = this.getState();
      if (canAfford(st, z.cost)) this.actions.unlockZone(next);
      else this.actions.goTo('bridge', next);
    });
    this.cards.set('zone:' + next, c);
    this.wsBody.appendChild(c);
  }

  private updateMachineCards(s: GameState, r: Rates): void {
    for (const id of MACHINE_ORDER) {
      const c = this.cards.get(id);
      if (!c) continue;
      const def = MACHINES[id];
      const owned = s.machines[id];
      const pm = r.perMachine[id];
      c.querySelector('.own')!.textContent = owned > 0 ? `×${owned}` : '';
      const n = owned === 0 ? 1 : this.buyMode === 'max' ? Math.max(1, maxAffordable(s, id)) : this.buyMode;
      const cost = costSum(def.baseCost, n, id, owned);
      const ok = canAfford(s, cost);
      const buy = c.querySelector('.buy') as HTMLButtonElement;
      const first = owned === 0;
      buy.className = 'buy' + (first ? ' goto' : ok ? '' : ' no');
      buy.querySelector('.lbl')!.textContent = first ? 'Y aller' : n > 1 ? `Acheter ×${n}` : 'Acheter';
      buy.querySelector('.price')!.innerHTML = costHtml(cost);
      buy.querySelector('small')!.textContent = first ? 'pour la poser' : ok ? '' : waitLabel(timeToAfford(s, r, cost));
      (buy.querySelector('.progress') as HTMLElement).style.width = `${affordProgress(s, cost) * 100}%`;

      const stats: string[] = [];
      if (id === 'refinery') {
        const per = owned > 0 ? pm.lumen / owned : 0;
        stats.push(owned > 0 ? `Produit <b>${formatRate(pm.lumen)}</b> lumen/s` : `Fond <b>10</b> éclats → <b>1</b> lumen`);
        if (owned > 0) stats.push(`Consomme <b>${formatRate(pm.processed)}</b> éclats/s`);
        if (r.refineSupplyLimited) stats.push(`<span style="color:#ffd59a">Manque d’éclats (max 50 % de ta production)</span>`);
        void per;
      } else {
        const unit = owned > 0 ? (pm.shards + pm.lumen) / owned : (def.shardsPerSec ?? 0) * r.globalMult * r.prestigeMult;
        stats.push(`+<b>${formatRate(unit)}</b> ${def.lumenPerSec ? 'éclats' : 'éclats'}/s chacune`);
        if (def.lumenPerSec) stats.push(`+<b>${formatRate(owned > 0 ? pm.lumen / owned : def.lumenPerSec)}</b> lumen/s chacune`);
        if (owned > 0) stats.push(`Total <b>${formatRate(pm.shards)}</b>/s (${Math.round(pm.share * 100)} %)`);
      }
      const ms = nextMilestone(owned);
      if (ms) stats.push(`Palier ${ms} : <b>×2</b>`);
      if (milestoneMult(owned) > 1) stats.push(`Bonus paliers <b>×${milestoneMult(owned)}</b>`);
      const html = stats.map((x) => `<span>${x}</span>`).join('');
      const st = c.querySelector('.stats')!;
      if (st.innerHTML !== html) st.innerHTML = html;
    }
    for (const [key, c] of this.cards) {
      if (!key.startsWith('zone:')) continue;
      const z = key.slice(5) as ZoneId;
      const cost = ZONES[z].cost;
      const ok = canAfford(s, cost) && canUnlockZone(s, z);
      const buy = c.querySelector('.buy') as HTMLButtonElement;
      buy.className = 'buy' + (ok ? '' : ' no');
      buy.querySelector('.lbl')!.textContent = 'Construire';
      buy.querySelector('.price')!.innerHTML = costHtml(cost);
      buy.querySelector('small')!.textContent = ok ? '' : waitLabel(timeToAfford(s, r, cost));
      (buy.querySelector('.progress') as HTMLElement).style.width = `${affordProgress(s, cost) * 100}%`;
    }
  }

  private buildUpgradeCards(ups: UpgradeDef[]): void {
    if (ups.length === 0) {
      this.wsBody.appendChild(el('div', 'empty', 'Aucune amélioration disponible pour l’instant.<br>Construis plus de machines pour en débloquer de nouvelles.'));
    }
    for (const u of ups) {
      const c = el(
        'div',
        'card',
        `<div class="icon">${ICONS[u.icon]}</div>
         <div class="name">${u.name}</div>
         <button class="buy"><span class="lbl">Acheter</span><span class="price"></span><small></small><i class="progress"></i></button>
         <div class="desc">${u.desc}</div>`,
      );
      const buy = c.querySelector('.buy') as HTMLButtonElement;
      buy.addEventListener('click', () => this.actions.buyUpgrade(u.id));
      buy.addEventListener('mouseenter', () => this.actions.sound('hover'));
      this.cards.set(u.id, c);
      this.wsBody.appendChild(c);
    }
    const owned = UPGRADES.filter((u) => this.getState().upgrades[u.id]);
    if (owned.length) {
      this.wsBody.appendChild(el('div', 'section-title', `Déjà acquises (${owned.length}/${UPGRADES.length})`));
      this.wsBody.appendChild(el('div', 'stats', `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 4px">${owned.map((u) => `<span title="${u.name} — ${u.desc}" style="display:inline-flex;width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,0.07);align-items:center;justify-content:center">${ICONS[u.icon]}</span>`).join('')}</div>`));
    }
  }

  private updateUpgradeCards(s: GameState, r: Rates, ups: UpgradeDef[]): void {
    for (const u of ups) {
      const c = this.cards.get(u.id);
      if (!c) continue;
      const ok = canAfford(s, u.cost);
      const buy = c.querySelector('.buy') as HTMLButtonElement;
      buy.className = 'buy' + (ok ? '' : ' no');
      buy.querySelector('.price')!.innerHTML = costHtml(u.cost);
      buy.querySelector('small')!.textContent = ok ? '' : waitLabel(timeToAfford(s, r, u.cost));
      (buy.querySelector('.progress') as HTMLElement).style.width = `${affordProgress(s, u.cost) * 100}%`;
    }
  }

  // -------------------------------------------------------------------------

  private buildMenu(): void {
    this.menu.innerHTML = `
      <header><h2>${ICONS.menu} Menu</h2><button class="close" title="Fermer (Échap)">✕</button></header>
      <div class="body">
        <div class="section-title">Réglages</div>
        <div class="menu-list">
          <div class="menu-row"><span>Effets sonores</span><input type="range" min="0" max="1" step="0.05" data-set="sfx"></div>
          <div class="menu-row"><span>Musique d’ambiance</span><input type="range" min="0" max="1" step="0.05" data-set="music"></div>
          <div class="menu-row"><span>Qualité graphique</span><select data-set="quality"><option value="auto">Automatique</option><option value="high">Haute</option><option value="low">Économie</option></select></div>
          <div class="menu-row"><span>Inverser l’axe vertical</span><input type="checkbox" data-set="invertY"></div>
        </div>
        <div class="section-title">Sauvegarde</div>
        <div class="menu-list">
          <p style="margin:0 4px;font-size:13px;color:var(--muted)">Ta partie est sauvegardée automatiquement dans ce navigateur toutes les 10 secondes. Copie ce code pour la transférer ailleurs.</p>
          <textarea class="save" spellcheck="false" placeholder="Colle ici un code de sauvegarde (ILES1…)"></textarea>
          <div class="row-btns">
            <button class="pill-btn" data-act="export">Exporter</button>
            <button class="pill-btn" data-act="copy">Copier</button>
            <button class="pill-btn primary" data-act="import">Importer</button>
          </div>
          <div class="save-msg" style="font-size:13px;color:var(--muted);min-height:18px;padding:0 4px"></div>
        </div>
        <div class="section-title">Statistiques</div>
        <div class="stats-grid"></div>
        <div class="section-title">Commandes</div>
        <div class="controls-list desktop-only">
          <kbd class="key">Z</kbd><kbd class="key">Q</kbd><kbd class="key">S</kbd><kbd class="key">D</kbd> ou <kbd class="key">W</kbd><kbd class="key">A</kbd><kbd class="key">S</kbd><kbd class="key">D</kbd> / flèches : marcher<br>
          Glisser la souris : tourner la caméra · Molette : zoom<br>
          Clic sur le cristal ou <kbd class="key">E</kbd> : récolter / interagir<br>
          <kbd class="key">Espace</kbd> : sauter · <kbd class="key">B</kbd> : Atelier · <kbd class="key">M</kbd> : son · <kbd class="key">Échap</kbd> : menu
        </div>
        <div class="controls-list touch-only">
          Joystick (gauche de l’écran) : marcher · Glisser à droite : caméra · Pincer : zoom<br>
          Toucher le cristal : récolter · Bouton Action : interagir
        </div>
        <div class="section-title">Zone dangereuse</div>
        <div class="row-btns"><button class="pill-btn danger" data-act="reset">Effacer la partie</button></div>
        <p style="font-size:12px;color:var(--dim);margin:18px 4px 0">Les Îles d’Éther · tout est généré en code (modèles, sons, musique).</p>
      </div>`;
    this.menu.querySelector('.close')!.addEventListener('click', () => this.close());
    const ta = this.menu.querySelector('textarea')! as HTMLTextAreaElement;
    const msg = this.menu.querySelector('.save-msg')! as HTMLElement;
    this.menu.querySelector('[data-act="export"]')!.addEventListener('click', () => {
      ta.value = this.actions.exportSave();
      ta.select();
      msg.textContent = 'Code généré. Garde-le précieusement !';
    });
    this.menu.querySelector('[data-act="copy"]')!.addEventListener('click', async () => {
      if (!ta.value) ta.value = this.actions.exportSave();
      try {
        await navigator.clipboard.writeText(ta.value);
        msg.textContent = 'Copié dans le presse-papiers.';
      } catch {
        ta.select();
        document.execCommand('copy');
        msg.textContent = 'Copié.';
      }
    });
    this.menu.querySelector('[data-act="import"]')!.addEventListener('click', () => {
      const err = this.actions.importSave(ta.value);
      msg.textContent = err ?? 'Sauvegarde chargée !';
      msg.style.color = err ? 'var(--bad)' : 'var(--good)';
    });
    let armed = false;
    const resetBtn = this.menu.querySelector('[data-act="reset"]')! as HTMLButtonElement;
    resetBtn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        resetBtn.textContent = 'Vraiment ? Clique encore pour tout effacer';
        window.setTimeout(() => {
          armed = false;
          resetBtn.textContent = 'Effacer la partie';
        }, 4000);
        return;
      }
      this.actions.reset();
    });
    this.menu.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-set]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const s = this.getState().settings;
        const k = inp.dataset.set!;
        if (k === 'sfx') s.sfx = Number(inp.value);
        if (k === 'music') s.music = Number(inp.value);
        if (k === 'quality') s.quality = inp.value as 'auto' | 'high' | 'low';
        if (k === 'invertY') s.invertY = (inp as HTMLInputElement).checked;
        this.actions.settingsChanged();
      });
    });
  }

  refreshMenu(): void {
    const s = this.getState();
    (this.menu.querySelector('[data-set="sfx"]') as HTMLInputElement).value = String(s.settings.sfx);
    (this.menu.querySelector('[data-set="music"]') as HTMLInputElement).value = String(s.settings.music);
    (this.menu.querySelector('[data-set="quality"]') as HTMLSelectElement).value = s.settings.quality;
    (this.menu.querySelector('[data-set="invertY"]') as HTMLInputElement).checked = s.settings.invertY;
    const st = s.stats;
    this.menu.querySelector('.stats-grid')!.innerHTML = `
      <span>Temps de jeu</span><b>${formatDuration(st.playSeconds)}</b>
      <span>Éclats sur cette île</span><b>${formatNumber(st.runShards)}</b>
      <span>Éclats au total</span><b>${formatNumber(st.allTimeShards)}</b>
      <span>Coups de pioche</span><b>${formatNumber(st.allTimeHarvests)}</b>
      <span>Îles descendues</span><b>${st.prestiges}</b>
      <span>Graines d’étoile</span><b>${s.seeds}</b>`;
  }

  // -------------------------------------------------------------------------

  showOffline(r: OfflineReport, onClose: () => void): void {
    const lumen = r.lumen > 0 ? `<div>${ICONS.lumen}+${formatNumber(r.lumen)}</div>` : '';
    this.offline.innerHTML = `
      <header><h2>Bon retour !</h2></header>
      <div class="modal-body">
        <p>Pendant ton absence (<b>${formatDuration(r.awaySeconds)}</b>), tes machines ont continué de travailler :</p>
        <div class="big-gain"><div>${ICONS.shard}+${formatNumber(r.shards)}</div>${lumen}</div>
        ${r.capped ? `<p style="font-size:13px">Les machines s’arrêtent après ${formatDuration(8 * 3600)} sans toi.</p>` : ''}
        <div class="row-btns"><button class="pill-btn primary" data-act="ok">Récupérer</button></div>
      </div>`;
    this.offline.querySelector('[data-act="ok"]')!.addEventListener('click', () => {
      this.close();
      onClose();
    });
    this.show(this.offline);
  }

  showPrestige(): void {
    const s = this.getState();
    const gain = prestigeGain(s);
    const ready = s.zones.sky && gain > 0;
    const newSeeds = s.seeds + gain;
    const curBonus = Math.round(s.seeds * PRESTIGE.bonusPerSeed * 100);
    const newBonus = Math.round(newSeeds * PRESTIGE.bonusPerSeed * 100);
    const need = PRESTIGE.unlockAt;
    this.prestigeModal.innerHTML = `
      <header><h2>${ICONS.lighthouse} Le Phare des étoiles</h2><button class="close">✕</button></header>
      <div class="modal-body">
        <p>Le Phare peut faire <b>descendre ton île</b> dans la mer de nuages. Une nouvelle île, plus fertile, poussera à sa place.</p>
        ${
          ready
            ? `<div class="big-gain"><div>${ICONS.seed}+${gain} Graine${gain > 1 ? 's' : ''} d’étoile</div></div>
               <p class="seed-preview">Bonus de production permanent : <b>+${curBonus} %</b> → <b>+${newBonus} %</b></p>`
            : `<p class="seed-preview">Le Phare dort encore. Récolte <b>${formatNumber(need)}</b> éclats sur cette île pour l’éveiller<br>(actuellement ${formatNumber(s.stats.runShards)}).</p>`
        }
        <div class="compare">
          <div class="lose"><h4>Tu perds</h4>Éclats et Lumen<br>Machines<br>Améliorations<br>Ponts</div>
          <div class="keep"><h4>Tu gardes</h4>Tes Graines d’étoile<br>(+${Math.round(PRESTIGE.bonusPerSeed * 100)} % de production chacune)<br>Tes statistiques</div>
        </div>
        <p style="font-size:13px">Plus tu récoltes avant de descendre, plus tu gagnes de graines.</p>
        <div class="row-btns">
          <button class="pill-btn" data-act="no">Pas encore</button>
          <button class="pill-btn violet" data-act="yes" ${ready ? '' : 'disabled'}>Faire descendre l’île</button>
        </div>
      </div>`;
    this.prestigeModal.querySelector('.close')!.addEventListener('click', () => this.close());
    this.prestigeModal.querySelector('[data-act="no"]')!.addEventListener('click', () => this.close());
    this.prestigeModal.querySelector('[data-act="yes"]')!.addEventListener('click', () => {
      this.close();
      this.actions.prestige();
    });
    this.show(this.prestigeModal);
  }
}
