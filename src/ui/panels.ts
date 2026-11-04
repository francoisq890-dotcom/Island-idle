/**
 * Panels in the « Carnet du Cartographe » style: workshop ledger, menu,
 * offline report and prestige. Each line of a ledger is one decision: what it
 * is, what it yields, what it costs.
 */
import { MACHINES, MACHINE_ORDER, PRESTIGE, prestigeThreshold, UPGRADES, ZONES, ZONE_ORDER, type Cost, type MachineId, type UpgradeDef, type ZoneId } from '../config/economy';
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
  buyMachine(id: MachineId, n: number): boolean;
  buyUpgrade(id: string): boolean;
  unlockZone(id: ZoneId): void;
  goTo(kind: 'site' | 'bridge', key: string): void;
  prestige(): void;
  exportSave(): string;
  importSave(text: string): string | null;
  reset(): void;
  settingsChanged(): void;
  sound(kind: 'open' | 'close' | 'tab' | 'hover' | 'click'): void;
}

export const MACHINE_ICON: Record<MachineId, IconName> = { drill: 'drill', excavator: 'excavator', refinery: 'refinery', geyser: 'geyser', prism: 'prism' };

function waitLabel(t: number): string {
  if (!isFinite(t) || t <= 0) return '';
  return `dans ${formatDuration(t)}`;
}

function costFor(id: MachineId, owned: number, n: number): Cost {
  const out: Cost = {};
  for (let i = 0; i < n; i++) {
    const k = machineCost(id, owned + i);
    if (k.shards) out.shards = (out.shards ?? 0) + k.shards;
    if (k.lumen) out.lumen = (out.lumen ?? 0) + k.lumen;
  }
  return out;
}

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

/** Brass seal button markup. */
export function seal(cls = ''): string {
  return `<button class="seal ${cls}" data-base="${cls}"><span class="lbl"></span><span class="price"></span><small></small><i class="fill"></i></button>`;
}

/** Update a seal button in place. */
export function setSeal(b: HTMLElement, o: { label: string; price: string; note?: string; ok: boolean; progress?: number; variant?: '' | 'go' | 'violet' }): void {
  const base = b.dataset.base ? ' ' + b.dataset.base : '';
  const cls = `seal${base}${o.variant ? ' ' + o.variant : ''}${o.ok || o.variant === 'go' ? '' : ' no'}`;
  if (b.className !== cls) b.className = cls;
  const lbl = b.querySelector('.lbl')!;
  if (lbl.textContent !== o.label) lbl.textContent = o.label;
  const pr = b.querySelector('.price')!;
  if (pr.innerHTML !== o.price) pr.innerHTML = o.price;
  const sm = b.querySelector('small')!;
  const note = o.note ?? '';
  if (sm.textContent !== note) sm.textContent = note;
  (b.querySelector('.fill') as HTMLElement).style.width = `${(o.progress ?? 0) * 100}%`;
}

/** Shared panel frame: brass-framed vellum, engraved title, close button. */
export function framePanel(cls: string, icon: IconName, title: string, sub = '', closable = true): HTMLElement {
  const p = el('div', `panel vellum ${cls}`);
  p.innerHTML = `<header><h2>${ICONS[icon]}<span>${title}${sub ? `<br><span class="sub">${sub}</span>` : ''}</span></h2>${closable ? `<button class="close" title="Fermer (Échap)">${ICONS.close}</button>` : ''}</header><div class="rule"></div>`;
  return p;
}

function stampRow(r: HTMLElement): void {
  r.classList.remove('stamp');
  void r.offsetWidth;
  r.classList.add('stamp');
}

// ---------------------------------------------------------------------------

export class Panels {
  private backdrop = el('div', 'backdrop');
  readonly workshop: HTMLElement;
  readonly menu: HTMLElement;
  readonly offline = framePanel('modal', 'clock', 'Bon retour !', '', false);
  readonly prestigeModal = framePanel('modal', 'lighthouse', 'Le Phare des étoiles');
  private tab: 'machines' | 'upgrades' = 'machines';
  private buyMode: 1 | 10 | 'max' = 1;
  private wsBody: HTMLElement;
  private rows = new Map<string, HTMLElement>();
  private signature = '';
  open: HTMLElement | null = null;
  private upgradeTabBadge: HTMLElement;
  /** Extra panels registered by other systems (runes, achievements…). */
  private extra: HTMLElement[] = [];
  onOpen?: (p: HTMLElement) => void;

  constructor(
    private parent: HTMLElement,
    private actions: PanelActions,
    private getState: () => GameState,
    private getRates: () => Rates,
  ) {
    this.workshop = framePanel('drawer', 'hammer', 'Atelier', 'Machines, îles et améliorations');
    this.workshop.insertAdjacentHTML(
      'beforeend',
      `<div class="tabs"><button class="tab on" data-tab="machines">Machines &amp; îles</button><button class="tab" data-tab="upgrades">Améliorations <span class="badge"></span></button></div>
       <div class="modes"><button class="mode on" data-mode="1">×1</button><button class="mode" data-mode="10">×10</button><button class="mode" data-mode="max">Max</button></div>
       <div class="body"></div>`,
    );
    this.menu = framePanel('drawer', 'menu', 'Carnet de bord', 'Réglages, sauvegarde, statistiques');
    parent.append(this.backdrop, this.workshop, this.menu, this.offline, this.prestigeModal);
    this.backdrop.addEventListener('click', () => this.close());
    this.wireClose(this.workshop);
    this.wireClose(this.menu);
    this.wireClose(this.prestigeModal);

    this.wsBody = this.workshop.querySelector('.body')!;
    this.upgradeTabBadge = this.workshop.querySelector('[data-tab="upgrades"] .badge')!;
    this.workshop.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => this.setTab(b.dataset.tab as 'machines' | 'upgrades')),
    );
    this.workshop.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.buyMode = b.dataset.mode === 'max' ? 'max' : (Number(b.dataset.mode) as 1 | 10);
        this.workshop.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
        this.actions.sound('tab');
        this.refresh();
      }),
    );
    this.buildMenu();
  }

  private wireClose(p: HTMLElement): void {
    p.querySelector('.close')?.addEventListener('click', () => this.close());
  }

  /** Register an additional panel so it shares open/close behaviour. */
  register(p: HTMLElement): void {
    this.extra.push(p);
    this.parent.appendChild(p);
    this.wireClose(p);
  }

  private setTab(t: 'machines' | 'upgrades'): void {
    if (t === this.tab) return;
    this.tab = t;
    this.workshop.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.tab === t));
    (this.workshop.querySelector('.modes') as HTMLElement).style.display = t === 'machines' ? '' : 'none';
    this.signature = '';
    this.actions.sound('tab');
    this.refresh();
  }

  isOpen(): boolean {
    return !!this.open;
  }

  show(p: HTMLElement): void {
    if (this.open === p) return;
    if (this.open) this.open.classList.remove('on');
    this.open = p;
    p.classList.add('on');
    this.backdrop.classList.add('on');
    this.actions.sound('open');
    if (p === this.workshop) {
      this.signature = '';
      this.refresh();
    }
    if (p === this.menu) this.refreshMenu();
    this.onOpen?.(p);
  }

  close(): void {
    if (!this.open) return;
    this.open.classList.remove('on');
    this.open = null;
    this.backdrop.classList.remove('on');
    this.actions.sound('close');
  }

  toggleWorkshop(tab?: 'machines' | 'upgrades'): void {
    if (this.open === this.workshop && !tab) return this.close();
    if (tab) this.setTab(tab);
    this.show(this.workshop);
  }

  affordableUpgrades(): number {
    const s = this.getState();
    return visibleUpgrades(s).filter((u) => canAfford(s, u.cost)).length;
  }

  // ---------------------------------------------------------------------------
  // Workshop
  // ---------------------------------------------------------------------------

  refresh(): void {
    if (this.open !== this.workshop) return;
    const s = this.getState();
    const r = this.getRates();
    const ups = visibleUpgrades(s).sort((a, b) => (a.cost.shards ?? 0) + (a.cost.lumen ?? 0) * 50 - ((b.cost.shards ?? 0) + (b.cost.lumen ?? 0) * 50));
    const n = ups.filter((u) => canAfford(s, u.cost)).length;
    this.upgradeTabBadge.classList.toggle('on', n > 0);
    this.upgradeTabBadge.textContent = String(n);

    const sig = this.tab + '|' + (this.tab === 'machines' ? ZONE_ORDER.map((z) => (s.zones[z] ? 1 : 0)).join('') + MACHINE_ORDER.map((m) => (s.machines[m] > 0 ? 1 : 0)).join('') : ups.map((u) => u.id).join(','));
    if (sig !== this.signature) {
      this.signature = sig;
      this.rows.clear();
      this.wsBody.innerHTML = '';
      if (this.tab === 'machines') this.buildMachineRows(s);
      else this.buildUpgradeRows(ups);
      // Cascade-in.
      this.wsBody.querySelectorAll<HTMLElement>('.row').forEach((row, i) => (row.style.animationDelay = `${i * 40}ms`));
    }
    if (this.tab === 'machines') this.updateMachineRows(s, r);
    else this.updateUpgradeRows(s, r, ups);
  }

  private row(icon: IconName, cls = ''): HTMLElement {
    const r = el('div', `row ${cls}`, `<div class="medal">${ICONS[icon]}</div><div class="row-main"><div class="row-title"><span class="nm"></span><span class="own"></span></div><div class="yield"></div><div class="meta"></div></div>${seal()}`);
    r.querySelector('.seal')!.addEventListener('mouseenter', () => this.actions.sound('hover'));
    return r;
  }

  private buildMachineRows(s: GameState): void {
    this.wsBody.appendChild(el('div', 'section-title', 'Machines'));
    const firstLocked = ZONE_ORDER.findIndex((z) => !s.zones[z]);
    for (const id of MACHINE_ORDER) {
      const def = MACHINES[id];
      if (!s.zones[def.zone]) {
        if (firstLocked < 0 || ZONE_ORDER.indexOf(def.zone) > firstLocked) continue;
        const r = el('div', 'row locked', `<div class="medal">${ICONS[MACHINE_ICON[id]]}</div><div class="row-main"><div class="row-title"><span class="nm">${def.name}</span></div><div class="meta">Se construit sur l’${ZONES[def.zone].name}.<br>Ouvre d’abord le ${ZONES[def.zone].bridgeName}.</div></div><div class="medal" style="width:40px;height:40px;padding:7px">${ICONS.lock}</div>`);
        this.wsBody.appendChild(r);
        continue;
      }
      const r = this.row(MACHINE_ICON[id]);
      r.title = def.blurb;
      r.querySelector('.nm')!.textContent = def.name;
      r.querySelector('.row-main')!.insertAdjacentHTML('beforeend', '<div class="msbar"><i></i></div>');
      r.querySelector('.seal')!.addEventListener('click', () => {
        const st = this.getState();
        if (st.machines[id] === 0) return this.actions.goTo('site', id);
        const n = this.buyMode === 'max' ? Math.max(1, maxAffordable(st, id)) : this.buyMode;
        if (this.actions.buyMachine(id, n)) stampRow(r);
      });
      this.rows.set(id, r);
      this.wsBody.appendChild(r);
    }

    const next = ZONE_ORDER.find((z) => !s.zones[z]);
    this.wsBody.appendChild(el('div', 'section-title', 'Expéditions'));
    if (!next) {
      this.wsBody.appendChild(el('div', 'empty', 'Toutes les îles sont reliées.<br>Le Phare t’attend sur l’Île Céleste.'));
      return;
    }
    const z = ZONES[next];
    const r = this.row('bridge');
    r.querySelector('.nm')!.textContent = z.bridgeName;
    r.querySelector('.yield')!.remove();
    r.querySelector('.meta')!.innerHTML = `Vers l’<b>${z.name}</b>. ${z.blurb}`;
    r.querySelector('.seal')!.addEventListener('click', () => {
      const st = this.getState();
      if (canAfford(st, z.cost)) this.actions.unlockZone(next);
      else this.actions.goTo('bridge', next);
    });
    this.rows.set('zone:' + next, r);
    this.wsBody.appendChild(r);
  }

  private updateMachineRows(s: GameState, r: Rates): void {
    for (const id of MACHINE_ORDER) {
      const row = this.rows.get(id);
      if (!row) continue;
      const def = MACHINES[id];
      const owned = s.machines[id];
      const pm = r.perMachine[id];
      const own = row.querySelector('.own')!;
      const ownTxt = owned > 0 ? `×${owned}` : '';
      if (own.textContent !== ownTxt) own.textContent = ownTxt;

      // Main line: what one more machine yields.
      let yieldHtml: string;
      let meta: string;
      if (id === 'refinery') {
        const per = owned > 0 ? pm.lumen / owned : (def.refineInput ?? 0) * 0.1 * r.globalMult * r.prestigeMult;
        yieldHtml = `<span class="yield gold" style="margin:0">+${formatRate(per)} ${ICONS.lumen}/s</span><small>chacune</small>`;
        meta = owned > 0 ? `Total <b>${formatRate(pm.lumen)}</b> lumen/s · consomme <b>${formatRate(pm.processed)}</b> éclats/s` : 'Fond 10 éclats en 1 Lumen';
        if (r.refineSupplyLimited) meta += `<br><span class="warn">Manque d’éclats : max 50 % de ta production</span>`;
      } else {
        const per = owned > 0 ? pm.shards / owned : (def.shardsPerSec ?? 0) * r.globalMult * r.prestigeMult;
        yieldHtml = `+${formatRate(per)} ${ICONS.shard}/s<small>chacune</small>`;
        if (def.lumenPerSec) yieldHtml += `<span class="yield gold" style="margin:0 0 0 6px">+${formatRate(owned > 0 ? pm.lumen / owned : def.lumenPerSec)} ${ICONS.lumen}</span>`;
        meta = owned > 0 ? `Total <b>${formatRate(pm.shards)}</b>/s · <b>${Math.round(pm.share * 100)} %</b> de l’île` : def.blurb;
      }
      const ms = nextMilestone(owned);
      if (ms && owned > 0) meta += ` · palier ${ms} ▸ <b>×2</b>`;
      if (milestoneMult(owned) > 1) meta += ` · paliers <b>×${milestoneMult(owned)}</b>`;
      const y = row.querySelector('.yield')!;
      if (y.innerHTML !== yieldHtml) y.innerHTML = yieldHtml;
      const m = row.querySelector('.meta')!;
      if (m.innerHTML !== meta) m.innerHTML = meta;
      const prev = [0, 25, 50, 100, 150, 200, 300, 400, 500].filter((x) => x <= owned).pop() ?? 0;
      (row.querySelector('.msbar i') as HTMLElement).style.width = ms ? `${((owned - prev) / (ms - prev)) * 100}%` : '100%';

      const n = owned === 0 ? 1 : this.buyMode === 'max' ? Math.max(1, maxAffordable(s, id)) : this.buyMode;
      const cost = costFor(id, owned, n);
      const ok = canAfford(s, cost);
      setSeal(row.querySelector('.seal') as HTMLElement, {
        label: owned === 0 ? 'Y aller' : n > 1 ? `Construire ×${n}` : 'Construire',
        price: costHtml(cost),
        note: owned === 0 ? 'poser sur place' : ok ? '' : waitLabel(timeToAfford(s, r, cost)),
        ok,
        progress: affordProgress(s, cost),
        variant: owned === 0 ? 'go' : '',
      });
    }
    for (const [key, row] of this.rows) {
      if (!key.startsWith('zone:')) continue;
      const z = key.slice(5) as ZoneId;
      const cost = ZONES[z].cost;
      const ok = canAfford(s, cost) && canUnlockZone(s, z);
      setSeal(row.querySelector('.seal') as HTMLElement, { label: ok ? 'Construire' : 'Y aller', price: costHtml(cost), note: ok ? '' : waitLabel(timeToAfford(s, r, cost)), ok, progress: affordProgress(s, cost) });
    }
  }

  private buildUpgradeRows(ups: UpgradeDef[]): void {
    if (ups.length === 0) this.wsBody.appendChild(el('div', 'empty', 'Aucune amélioration pour l’instant.<br>Construis des machines pour en découvrir.'));
    for (const u of ups) {
      const r = this.row(u.icon);
      r.querySelector('.nm')!.textContent = u.name;
      r.querySelector('.yield')!.remove();
      r.querySelector('.meta')!.textContent = u.desc;
      (r.querySelector('.meta') as HTMLElement).style.fontSize = '15px';
      (r.querySelector('.meta') as HTMLElement).style.color = 'var(--ink)';
      r.querySelector('.seal')!.addEventListener('click', () => {
        if (this.actions.buyUpgrade(u.id)) stampRow(r);
      });
      this.rows.set(u.id, r);
      this.wsBody.appendChild(r);
    }
    const owned = UPGRADES.filter((u) => this.getState().upgrades[u.id]);
    if (owned.length) {
      this.wsBody.appendChild(el('div', 'section-title', `Acquises · ${owned.length}/${UPGRADES.length}`));
      this.wsBody.appendChild(el('div', 'owned-strip', owned.map((u) => `<span title="${u.name} — ${u.desc}">${ICONS[u.icon]}</span>`).join('')));
    }
  }

  private updateUpgradeRows(s: GameState, r: Rates, ups: UpgradeDef[]): void {
    for (const u of ups) {
      const row = this.rows.get(u.id);
      if (!row) continue;
      const ok = canAfford(s, u.cost);
      setSeal(row.querySelector('.seal') as HTMLElement, { label: 'Acheter', price: costHtml(u.cost), note: ok ? '' : waitLabel(timeToAfford(s, r, u.cost)), ok, progress: affordProgress(s, u.cost) });
    }
  }

  // ---------------------------------------------------------------------------
  // Menu
  // ---------------------------------------------------------------------------

  private buildMenu(): void {
    this.menu.insertAdjacentHTML(
      'beforeend',
      `<div class="body">
        <div class="section-title">Réglages</div>
        <div class="menu-list">
          <div class="menu-row"><span>Effets sonores</span><input type="range" min="0" max="1" step="0.05" data-set="sfx"></div>
          <div class="menu-row"><span>Musique d’ambiance</span><input type="range" min="0" max="1" step="0.05" data-set="music"></div>
          <div class="menu-row"><span>Qualité graphique</span><select data-set="quality"><option value="auto">Automatique</option><option value="high">Haute</option><option value="low">Économie</option></select></div>
          <div class="menu-row"><span>Inverser l’axe vertical</span><input type="checkbox" data-set="invertY"></div>
        </div>
        <div class="section-title">Sauvegarde</div>
        <p class="note">Ta partie est sauvegardée toute seule dans ce navigateur. Copie ce code pour la transférer ailleurs.</p>
        <textarea class="save" spellcheck="false" placeholder="Colle ici un code de sauvegarde (ILES…)"></textarea>
        <div class="row-btns">
          <button class="pill-btn" data-act="export">Exporter</button>
          <button class="pill-btn" data-act="copy">Copier</button>
          <button class="pill-btn primary" data-act="import">Importer</button>
        </div>
        <p class="note save-msg"></p>
        <div class="section-title">Statistiques</div>
        <div class="stats-grid"></div>
        <div class="section-title">Commandes</div>
        <div class="controls-list desktop-only">
          <kbd class="key">Z</kbd> <kbd class="key">Q</kbd> <kbd class="key">S</kbd> <kbd class="key">D</kbd> ou <kbd class="key">W</kbd> <kbd class="key">A</kbd> <kbd class="key">S</kbd> <kbd class="key">D</kbd> ou flèches : marcher<br>
          Glisser la souris : tourner · Molette : zoom<br>
          Clic sur le cristal ou <kbd class="key">E</kbd> : frapper / interagir<br>
          <kbd class="key">Espace</kbd> sauter · <kbd class="key">B</kbd> Atelier · <kbd class="key">R</kbd> Runes · <kbd class="key">M</kbd> son · <kbd class="key">Échap</kbd> menu
        </div>
        <div class="controls-list touch-only">Joystick à gauche : marcher · glisser à droite : caméra · pincer : zoom<br>Toucher le cristal ou Action : frapper / interagir</div>
        <div class="section-title">Zone dangereuse</div>
        <div class="row-btns"><button class="pill-btn danger" data-act="reset">Effacer la partie</button></div>
      </div>`,
    );
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

  // ---------------------------------------------------------------------------
  // Modals
  // ---------------------------------------------------------------------------

  private modalBody(p: HTMLElement, html: string): void {
    p.querySelector('.modal-body')?.remove();
    p.insertAdjacentHTML('beforeend', `<div class="modal-body">${html}</div>`);
  }

  showOffline(r: OfflineReport, onClose: () => void): void {
    this.modalBody(
      this.offline,
      `<p>Pendant ton absence (<b>${formatDuration(r.awaySeconds)}</b>), tes machines ont continué de travailler :</p>
       <div class="big-gain"><div>${ICONS.shard}+${formatNumber(r.shards)}</div>${r.lumen > 0 ? `<div class="gold">${ICONS.lumen}+${formatNumber(r.lumen)}</div>` : ''}</div>
       ${r.capped ? `<p class="note">Les machines s’arrêtent après ${formatDuration(r.creditedSeconds)} sans toi.</p>` : ''}
       <div class="row-btns"><button class="pill-btn primary" data-act="ok">Récupérer</button></div>`,
    );
    this.offline.querySelector('[data-act="ok"]')!.addEventListener('click', () => {
      this.close();
      onClose();
    });
    this.show(this.offline);
  }

  showPrestige(extraKeep = ''): void {
    const s = this.getState();
    const gain = prestigeGain(s);
    const ready = s.zones.sky && gain > 0;
    const curBonus = Math.round(s.seeds * PRESTIGE.bonusPerSeed * 100);
    const newBonus = Math.round((s.seeds + gain) * PRESTIGE.bonusPerSeed * 100);
    this.modalBody(
      this.prestigeModal,
      `<p>Le Phare peut faire <b>descendre ton île</b> dans la mer de nuages. Une île nouvelle, plus fertile, poussera à sa place.</p>
       ${
         ready
           ? `<div class="big-gain"><div class="violet">${ICONS.seed}+${gain}</div></div>
              <p class="seed-preview">Graine${gain > 1 ? 's' : ''} d’étoile · production <b>+${curBonus} %</b> → <b>+${newBonus} %</b></p>`
           : `<p class="seed-preview">Le Phare dort encore. Récolte <b>${formatNumber(prestigeThreshold(s.stats.prestiges))}</b> éclats sur cette île pour l’éveiller<br>(actuellement ${formatNumber(s.stats.runShards)}).</p>`
       }
       <div class="compare">
         <div class="lose"><h4>Tu perds</h4>Éclats et Lumen<br>Machines et améliorations<br>Ponts<br>Runes communes à épiques</div>
         <div class="keep"><h4>Tu gardes</h4>Graines d’étoile (+${Math.round(PRESTIGE.bonusPerSeed * 100)} % chacune)<br>Runes légendaires et plus<br>Succès et statistiques${extraKeep}</div>
       </div>
       <p class="note">Plus tu récoltes avant de descendre, plus tu gagnes de graines.</p>
       <div class="row-btns"><button class="pill-btn" data-act="no">Pas encore</button><button class="pill-btn violet" data-act="yes" ${ready ? '' : 'disabled'}>Faire descendre l’île</button></div>`,
    );
    this.prestigeModal.querySelector('[data-act="no"]')!.addEventListener('click', () => this.close());
    this.prestigeModal.querySelector('[data-act="yes"]')!.addEventListener('click', () => {
      this.close();
      this.actions.prestige();
    });
    this.show(this.prestigeModal);
  }
}
