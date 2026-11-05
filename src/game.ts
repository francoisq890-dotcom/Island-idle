/**
 * Game orchestration: main loop, input → actions, economy ↔ world ↔ UI ↔ audio,
 * tutorial objectives, saving, offline progress and the prestige sequence.
 */
import * as THREE from 'three';
import { Audio } from './audio/audio';
import { MACHINES, MILESTONES, ZONES, ZONE_ORDER, type MachineId, type ZoneId } from './config/economy';
import { PALETTE } from './config/palette';
import { RANGES, SPAWN } from './config/world';
import { Input } from './core/input';
import { Ease, Tweens } from './core/tween';
import {
  buyMachine,
  buyUpgrade,
  canAfford,
  canPrestige,
  computeRates,
  doPrestige,
  getUpgrade,
  harvestEx,
  milestoneMult,
  nextMachineCost,
  nextMilestone,
  prestigeGain,
  islandThreshold,
  prestigeMult,
  tick,
  timeToAfford,
  unlockZone,
  type Rates,
} from './economy/economy';
import { formatDuration, formatNumber, formatRate } from './economy/format';
import { OBJECTIVES, type Objective, type ObjectiveTarget } from './economy/objectives';
import { applyOffline, shouldShowOfflineReport, type OfflineReport } from './economy/offline';
import { createInitialState, type GameState } from './economy/state';
import { clearStorage, exportSave, importSave, loadFromStorage, saveToStorage } from './save/save';
import { costHtml, Hud } from './ui/hud';
import { ICONS } from './ui/icons';
import { MACHINE_ICON, Panels } from './ui/panels';
import { Journal } from './ui/journal';
import { Celebration, RunePanel, runeEffect, statText as statTextFn } from './ui/runes';
import { FAMILIES, RARITIES, RARITY_INDEX, RUNE_BY_ID, type FamilyId, type RuneDef } from './config/runes';
import { autoRollAllowed, buyAltarUpgrade, cooldownOf, doRoll, fuse, luckOf, rollCostOf } from './economy/runes';
import { EVENTS, between } from './config/events';
import { CONSTELLATIONS, hasPerk } from './config/constellations';
import { GoldenCrystal, MeteorField } from './world/events';
import { Guardian } from './world/guardian';
import { FamiliarPanel } from './ui/familiars';
import { buyEgg, familiarsUnlocked, hatch, levelUp, petPower, setPerched } from './economy/familiars';
import { PET_RARITIES, SPECIES } from './config/familiars';
import { TalentPanel } from './ui/talents';
import { AscensionPanel } from './ui/ascension';
import { ascensionUnlocked, buyRelic, canAscend } from './economy/ascension';
import { CHALLENGES, RELICS, type ChallengeId } from './config/ascension';
import { DockPanel, MerchantPanel } from './ui/expeditions';
import { MerchantBalloon, Rift } from './world/dock';
import { EXPEDITION, EXPEDITIONS, MERCHANT, RIFT } from './config/expeditions';
import { claimExpedition, isDone, startExpedition } from './economy/expeditions';
import { buyOffer, laterEventsUnlocked, openSurge, surgeLeft, type OfferId } from './economy/events2';
import { autoBuyStep, canPlant, guardianBonusTime, pickPath, plant, respec, seedsFree, talentsUnlocked } from './economy/talents';
import { TALENT_BY_ID, TALENTS } from './config/talents';
import { GUARDIAN } from './config/guardians';
import { defeatGuardian, guardiansUnlocked } from './economy/guardians';
import { abandonChallenge, addLumen, addShards, checkChallenge, doAscend, startChallenge } from './economy/economy';
import { checkAchievements, type AchievementUnlock } from './economy/achievements';
import { TIER_NAMES } from './config/achievements';
import { achievementDesc } from './ui/journal';
import { Renderer } from './world/renderer';
import { cycleSeeds } from './economy/ascension';
import { isNight, nightAmount, nightLength, secondsToDawn, secondsToNight } from './economy/daynight';
import { DAY_NIGHT } from './config/daynight';
import { World, type Interactable } from './world/world';

const AUTOSAVE_SECONDS = 10;

export class Game {
  state: GameState;
  private rates: Rates;
  private dirty = true;
  private renderer: Renderer;
  private world: World;
  private input: Input;
  private tweens = new Tweens();
  private audio = new Audio();
  private hud: Hud;
  private panels: Panels;
  private lastFrame = performance.now();
  private time = 0;
  private saveTimer = 0;
  private uiTimer = 0;
  private hoverTimer = 0;
  private hovered: Interactable | null = null;
  private near: Interactable | null = null;
  private started = false;
  private busy = false; // cinematic in progress
  private holdTimer = 0;
  private offlineReport: OfflineReport | null = null;
  private tmpScreen = { x: 0, y: 0, visible: false };
  private lastObjectiveId = '';
  private titleOrbit = 0;
  private stepToggle = false;
  private runePanel!: RunePanel;
  private journal!: Journal;
  private celebration!: Celebration;
  private rollTimer = 0;
  private lastFamily: FamilyId = 'stone';
  /** Global time scale (slow motion during big rune drops). */
  private timeScale = 1;
  private meteors!: MeteorField;
  private golden!: GoldenCrystal;
  private goldenIt!: Interactable;
  private nextMeteor = between(EVENTS.meteor.first);
  private nextGolden = between(EVENTS.golden.first);
  private combo = 0;
  private lastHitTime = -9;
  private incomeAcc = 0;
  private lumenAcc = 0;
  private incomeTimer = 0;

  constructor(private canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const loaded = loadFromStorage();
    this.state = loaded ?? createInitialState();
    if (loaded) this.offlineReport = applyOffline(this.state);
    if (this.offlineReport && this.offlineReport.awaySeconds > 8 * 3600) this.state.flags.sec_patient = true;
    // Silent catch-up (e.g. right after the v3 migration): no toast storm on load.
    checkAchievements(this.state);
    this.rates = computeRates(this.state);

    this.renderer = new Renderer(canvas);
    this.renderer.setQuality(this.state.settings.quality);
    this.world = new World(this.renderer, this.tweens, this.state);
    this.world.player.setGlow(this.state.seeds > 0 ? PALETTE.seed : PALETTE.lumen);
    this.world.player.setPickTier(pickTierOf(this.state));
    this.world.player.onSwing = () => this.audio.swoosh(this.world.player.pickTierIndex);
    this.world.player.onPresentPeak = (at) => this.world.pickRevealFx(at);
    this.input = new Input(canvas);

    this.hud = new Hud(uiRoot, (x, y, z, out) => this.world.project(new THREE.Vector3(x, y, z), out));
    this.panels = new Panels(
      uiRoot,
      {
        buyMachine: (id, n) => this.buyMachine(id, n),
        buyUpgrade: (id) => this.buyUpgrade(id),
        unlockZone: (id) => this.unlockZone(id),
        goTo: (kind, key) => this.goTo(kind, key),
        prestige: () => void this.prestige(),
        openGarden: () => this.openGarden(),
        openAscension: () => this.openAscension(),
        exportSave: () => exportSave(this.snapshot()),
        importSave: (t) => this.importSave(t),
        reset: () => this.hardReset(),
        settingsChanged: () => this.applySettings(),
        sound: (k) => this.audio.ui(k),
      },
      () => this.state,
      () => this.rates,
    );

    this.runePanel = new RunePanel(
      {
        roll: (f) => this.rollRunes(f, false),
        buyAltar: (id) => this.buyAltar(id),
        setAuto: (f) => {
          this.state.runeAuto = f;
          this.audio.ui('click');
        },
        nearAltar: (f) => this.nearAltar(f),
        fuse: (id) => this.fuseRune(id),
        sound: (k) => this.audio.ui(k),
      },
      () => this.state,
      () => this.rates,
    );
    this.panels.register(this.runePanel.el);
    this.celebration = new Celebration(uiRoot);
    this.journal = new Journal(() => this.state, (k) => this.audio.ui(k));
    this.panels.register(this.journal.el);
    this.petPanel = new FamiliarPanel(
      {
        buyEgg: () => this.buyEggAction(),
        hatch: () => this.hatchAction(),
        levelUp: (id) => this.petLevelAction(id),
        togglePerch: (id) => {
          const p = this.state.pets.find((x) => x.id === id);
          const ok = !!p && setPerched(this.state, id, !p.perched);
          if (ok) {
            this.audio.ui('click');
            this.markDirty();
          } else {
            this.audio.error();
            this.hud.toast('egg', 'Tous les perchoirs sont pris', 'Fais d’abord descendre un autre familier.');
          }
          return ok;
        },
        sound: (k) => this.audio.ui(k),
      },
      () => this.state,
      () => this.rates,
    );
    this.panels.register(this.petPanel.el);
    this.talentPanel = new TalentPanel(
      {
        plant: (id) => this.plantTalent(id),
        respec: () => {
          const ok = respec(this.state);
          if (ok) {
            this.audio.ui('tab');
            this.markDirty();
            this.hud.toast('seed', 'Jardin replanté', 'Toutes tes graines sont de nouveau libres.', 'violet');
          } else this.audio.error();
          return ok;
        },
        toggleAutoBuy: () => {
          this.state.autoBuy = !this.state.autoBuy;
          this.audio.ui('click');
        },
        sound: (k) => this.audio.ui(k),
      },
      () => this.state,
    );
    this.panels.register(this.talentPanel.el);
    this.dockPanel = new DockPanel(
      {
        start: (petId, dur) => this.startTrip(petId, dur),
        claim: (i) => this.claimTrip(i),
        sound: (k) => this.audio.ui(k),
      },
      () => this.state,
      () => this.rates,
    );
    this.panels.register(this.dockPanel.el);
    this.merchantPanel = new MerchantPanel((id) => this.buyFromMerchant(id), () => this.state, () => this.rates);
    this.panels.register(this.merchantPanel.el);
    this.ascPanel = new AscensionPanel(
      {
        ascend: () => void this.ascend(),
        buyRelic: (id) => {
          const ok = buyRelic(this.state, id);
          if (ok) {
            this.audio.pickReveal(5);
            this.markDirty();
            const rel = RELICS.find((x) => x.id === id)!;
            this.hud.toast('crown', `Relique : ${rel.name}`, rel.desc, 'gold');
            this.afterProgress();
          } else this.audio.error();
          return ok;
        },
        startChallenge: (id) => this.startChallengeAction(id),
        abandonChallenge: () => {
          if (abandonChallenge(this.state)) {
            this.markDirty();
            this.hud.toast('crown', 'Défi abandonné', 'L’île continue sans contrainte.');
          }
        },
        toggleAutoPrestige: () => {
          this.state.ascension.autoPrestige = !this.state.ascension.autoPrestige;
          this.audio.ui('click');
        },
        sound: (k) => this.audio.ui(k),
      },
      () => this.state,
    );
    this.panels.register(this.ascPanel.el);
    this.rift = new Rift(this.world.particles);
    this.merchant = new MerchantBalloon();
    this.world.scene.add(this.rift.group, this.merchant.group);
    this.riftIt = { id: 'rift', kind: 'rift', anchor: new THREE.Vector3(), range: 3.4, sphere: new THREE.Sphere(new THREE.Vector3(), 1.6), active: false };
    this.merchantIt = { id: 'merchant', kind: 'merchant', anchor: new THREE.Vector3(), range: 3.6, sphere: new THREE.Sphere(new THREE.Vector3(), 2), active: false };
    this.world.interactables.push(this.riftIt, this.merchantIt);
    // Ships at the dock reflect the expeditions on load.
    for (let i = 0; i < 2; i++) this.world.dock.snapShip(i, this.shipState(i));
    this.world.familiars.onPeck = (pet, at) => {
      if (!this.started || this.busy) return;
      const near = this.world.player.position.distanceTo(at) < 26;
      if (!near) return;
      this.audio.peck(pet.species);
      const v = petPower(this.state, pet, this.rates.bonus.pet) * this.rates.click;
      if (v >= 1) this.hud.float(at.x, at.y + 0.6, at.z, `+${formatNumber(v, 1)}`, 'small pet', 0.9);
    };

    // Random events.
    this.meteors = new MeteorField(this.world.particles);
    this.golden = new GoldenCrystal(this.world.particles);
    this.world.scene.add(this.meteors.group, this.golden.group);
    this.goldenIt = { id: 'golden', kind: 'golden', anchor: new THREE.Vector3(), range: 3.2, sphere: new THREE.Sphere(new THREE.Vector3(), 1.6), active: false };
    this.world.interactables.push(this.goldenIt);
    this.guardian = new Guardian(this.world.particles);
    this.world.scene.add(this.guardian.group, this.guardian.waveMesh);
    this.guardianIt = { id: 'guardian', kind: 'guardian', anchor: new THREE.Vector3(), range: 3.4, sphere: new THREE.Sphere(new THREE.Vector3(), 1.9), active: false };
    this.world.interactables.push(this.guardianIt);
    const gp = this.guardian.position;
    // The golem is solid while it fights (moving obstacle: getters follow it).
    this.world.ground.obstacles.push({ get x() { return gp.x; }, get z() { return gp.z; }, r: 1.25, zone: 'home', active: () => this.guardian.active });
    this.guardian.onSlam = () => {
      this.audio.guardianSlam();
      this.world.rig.shake(0.55);
      this.waveHitDone = false;
    };
    this.meteors.onLand = () => {
      this.audio.meteorLand();
      this.world.rig.shake(0.12);
    };
    this.meteors.onCollect = (p) => this.collectMeteor(p);

    this.world.hooks = {
      onArrive: (k) => this.audio.arrive(k),
      onStep: () => {
        this.stepToggle = !this.stepToggle;
        this.audio.step();
        if (this.stepToggle) this.world.particles.smoke(this.world.player.position.clone().setY(this.world.player.position.y + 0.08), { count: 1, color: 0xf4e6d4, speed: 0.6, life: 0.45, size: 0.12, up: 0.3 });
      },
      onPlank: () => this.audio.plank(),
    };
    this.world.sync(this.state, this.rates, false);
    this.world.conveyors.prefill();

    this.bindUi();
    this.applySettings();

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
      else if (this.started) {
        // Credit time spent in another tab (the loop is paused by the browser).
        const r = applyOffline(this.state);
        this.markDirty();
        if (shouldShowOfflineReport(r) && r.creditedSeconds > 120) this.panels.showOffline(r, () => this.audio.welcome());
      }
    });
    window.addEventListener('beforeunload', () => this.save());

    // Title-screen camera.
    this.world.rig.cinematic = { pos: new THREE.Vector3(), look: new THREE.Vector3(0, 0, -8), weight: 1 };
    this.updateTitleCamera(0);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  run(): void {
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Called when the player clicks "Jouer" on the title screen. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.audio.unlock();
    this.applySettings();
    const cin = this.world.rig.cinematic!;
    this.tweens.add(2.2, (v) => (cin.weight = 1 - v), {
      ease: Ease.inOutCubic,
      done: () => {
        this.world.rig.cinematic = null;
        this.hud.show(true);
        if (this.state.flags.migratedV2 && !this.state.flags.v2Seen) {
          this.state.flags.v2Seen = true;
          this.hud.toast('altar', 'Nouveau : les autels des runes', 'Un autel t’attend sur chaque île. Tire des runes pour des bonus permanents.', 'violet');
        }
        if (this.state.flags.migratedV4 && !this.state.flags.v4Seen) {
          this.state.flags.v4Seen = true;
          window.setTimeout(() => this.hud.toast('egg', 'Nouveau : les familiers d’éther', 'Un œuf t’attend au Nid, sur l’Îlot des Geysers. Touche N.', 'ether'), 4200);
        }
        if (this.state.flags.migratedV3 && !this.state.flags.v3Seen) {
          this.state.flags.v3Seen = true;
          this.hud.toast('trophy', 'Nouveau : 62 succès à paliers', 'Bronze, argent, or : chaque palier donne un bonus permanent. Ouvre le Journal (J).', 'gold');
        }
        if (this.offlineReport && shouldShowOfflineReport(this.offlineReport)) {
          this.panels.showOffline(this.offlineReport, () => this.audio.welcome());
          this.audio.welcome();
        }
        this.offlineReport = null;
      },
    });
    this.save();
  }

  private updateTitleCamera(dt: number): void {
    this.titleOrbit += dt * 0.05;
    const cin = this.world.rig.cinematic;
    if (!cin || this.started) return;
    const a = this.titleOrbit + 0.6;
    cin.pos.set(Math.sin(a) * 52, 24, Math.cos(a) * 52 - 14);
    cin.look.set(0, -2, -14);
  }

  private frame(realDt: number): void {
    const dt = realDt * this.timeScale;
    this.time += dt;
    this.tweens.update(dt);
    this.input.update();
    this.audio.update(dt);

    if (this.dirty) {
      this.rates = computeRates(this.state);
      this.dirty = false;
    }

    if (!this.started) this.updateTitleCamera(dt);
    if (this.started && !this.busy) this.handleInput(dt);

    // Player & camera.
    const move = this.started && !this.busy && this.stunned <= 0 ? this.input.move : { x: 0, y: 0 };
    this.stunned = Math.max(0, this.stunned - dt);
    this.lastPos.copy(this.world.player.position);
    this.world.player.update(dt, move, this.world.rig.viewYaw, this.world.ground, this.time);
    const moved = Math.hypot(this.world.player.position.x - this.lastPos.x, this.world.player.position.z - this.lastPos.z);
    if (moved < 2) this.state.counters.distance += moved;
    this.stillTime = moved > 0.001 ? 0 : this.stillTime + dt;
    this.world.rig.target.copy(this.world.player.position).add(new THREE.Vector3(0, 1.3, 0));
    this.world.rig.update(dt);

    // Economy.
    tick(this.state, dt, this.rates);
    this.updateDayNight();
    this.autoBuyTimer -= dt;
    if (this.autoBuyTimer <= 0 && this.started && !this.busy) {
      this.autoBuyTimer = 0.5;
      const before = { ...this.state.machines };
      const got = autoBuyStep(
        this.state,
        (id) => {
          const n = this.state.machines[id];
          const pm = this.rates.perMachine[id];
          return n > 0 ? (pm.shards + pm.lumen * 25) / n : 0;
        },
        (id) => { const c = nextMachineCost(this.state, id); return (c.shards ?? 0) + (c.lumen ?? 0) * 25; },
        (id) => buyMachine(this.state, id),
      );
      if (got) {
        this.markDirty();
        const { spawned } = this.world.sync(this.state, this.rates, true);
        spawned.slice(-1).forEach((sp) => this.world.spawnFx(sp.machine, sp.index));
        for (const m of MILESTONES) if (before[got] < m && this.state.machines[got] >= m) this.hud.toast(MACHINE_ICON[got], `Palier ${m} atteint !`, `${MACHINES[got].plural} : production ×2`, 'gold');
        this.afterProgress();
      }
    }
    this.rollTimer = Math.max(0, this.rollTimer - dt);
    if (this.started && !this.busy && this.state.altar.auto && this.state.runeAuto && this.rollTimer <= 0) {
      this.rollTimer = cooldownOf(this.state);
      // Auto-roll only spends a small share of the income (never the savings).
      if (autoRollAllowed(this.state, this.state.runeAuto, this.rates)) this.rollRunes(this.state.runeAuto, true);
    }
    this.incomeAcc += this.rates.shards * dt;
    this.lumenAcc += this.rates.lumen * dt;
    this.incomeTimer += dt;
    if (this.incomeTimer > 2.5) {
      // Show what the machines brought in, right above the Nexus.
      const c = this.world.nexus.corePosition;
      const nearNexus = this.world.player.position.distanceTo(c) < 40;
      if (this.started && !this.busy && nearNexus && this.incomeAcc >= 1) this.hud.float(c.x, c.y + 1.6, c.z, `+${formatNumber(this.incomeAcc)}${ICONS.shard}`, 'small', 1.6);
      if (this.started && !this.busy && nearNexus && this.lumenAcc >= 1) this.hud.float(c.x + 0.8, c.y + 1.2, c.z, `+${formatNumber(this.lumenAcc)}${ICONS.lumen}`, 'small lumen', 1.6);
      this.incomeAcc = 0;
      this.lumenAcc = 0;
      this.incomeTimer = 0;
    }
    if (this.started) this.state.flags.started = true;

    // Proximity flags for objectives.
    const p = this.world.player.position;
    if (!this.state.flags.nearCrystal && this.world.distanceTo(this.world.interactables[0], p) < RANGES.harvest + 0.5) this.state.flags.nearCrystal = true;

    this.world.update(dt, this.state);
    this.updateEvents(dt);
    const isl = this.world.ground.islandAt(this.world.player.position.x, this.world.player.position.z, -3);
    this.audio.setZone(isl ? isl.zone : this.audio.ambZoneOr('home'));
    this.updateUi(dt);
    this.hud.update(dt);

    this.saveTimer += dt;
    if (this.saveTimer > AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.save();
    }

    this.renderer.render(realDt);
    this.input.endFrame();
  }

  private wasNight: boolean | null = null;

  /** Sky, lights, sounds and announcements of the day/night cycle. */
  private updateDayNight(): void {
    const s = this.state;
    const k = nightAmount(s);
    this.renderer.setNight(k);
    this.audio.night = k;
    const night = isNight(s);
    if (this.wasNight !== null && night !== this.wasNight) this.markDirty();
    if (this.wasNight !== null && night !== this.wasNight && this.started && !this.busy) {
      if (night) {
        this.audio.nightFall();
        if (!s.flags.nightSeen) {
          s.flags.nightSeen = true;
          this.hud.toast('moon', 'La nuit tombe sur l’archipel', `Les cristaux brillent et la chance des runes monte de 50 % jusqu’à l’aube (${formatDuration(nightLength(s))}).`, 'violet');
        } else this.hud.toast('moon', 'La nuit tombe', 'Chance des runes ×1,5 jusqu’à l’aube', 'violet');
      } else {
        this.audio.dawn();
        this.hud.toast('sun', 'L’aube se lève', `Prochaine nuit dans ${formatDuration(secondsToNight(s))}`, 'gold');
      }
      this.afterProgress();
    }
    this.wasNight = night;
    if (night && this.stillTime >= 60) this.secret('sec_stargazer');
    const label = night ? `<b>Nuit</b> · chance ×1,5 · aube dans ${formatDuration(secondsToDawn(s))}` : `Nuit dans <b>${formatDuration(secondsToNight(s))}</b>`;
    const prog = night ? 1 - secondsToDawn(s) / nightLength(s) : 1 - secondsToNight(s) / (DAY_NIGHT.cycle - nightLength(s));
    this.hud.setClock(night, prog, label, s.stats.playSeconds > 60 || s.stats.prestiges > 0);
  }

  private markDirty(): void {
    this.dirty = true;
    this.rates = computeRates(this.state);
    this.dirty = false;
    this.world.player.strikeSpeed = this.rates.strikeSpeed;
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private handleInput(dt: number): void {
    const inp = this.input;
    const panelOpen = this.panels.isOpen();
    if (inp.pressed('Escape')) {
      if (panelOpen) this.panels.close();
      else this.panels.show(this.panels.menu);
    }
    if (inp.pressed('KeyB', 'Tab')) {
      this.audio.click();
      this.panels.toggleWorkshop(this.currentObjective()?.id === 'pick1' ? 'upgrades' : undefined);
    }
    if (inp.pressed('KeyM')) this.toggleMute();
    if (inp.pressed('KeyJ')) this.togglePanel(this.journal.el, () => this.journal.refresh());
    if (inp.pressed('KeyT') && talentsUnlocked(this.state)) this.openGarden(true);
    if (inp.pressed('KeyN') && familiarsUnlocked(this.state)) this.togglePanel(this.petPanel.el, () => this.petPanel.refresh());
    if (inp.pressed('KeyR')) this.openRunes(this.near?.kind === 'altar' ? this.near.family! : this.lastFamily);
    if (inp.pressed('KeyP') && this.state.zones.sky) this.panels.showPrestige();

    if (!inp.dragging) {
      this.world.rig.orbit(inp.orbitDx, inp.orbitDy, this.state.settings.invertY);
    } else this.world.rig.orbit(inp.orbitDx, inp.orbitDy, this.state.settings.invertY);
    if (inp.zoomDelta) this.world.rig.zoom(inp.zoomDelta);

    if (inp.pressed('Space')) {
      this.doJump();
    }

    this.near = this.world.nearest();
    if (inp.pressed('KeyE', 'Enter', 'KeyF')) this.interact(this.near, true);
    // Holding the action key on the crystal keeps harvesting (3 strikes/s).
    if (this.near?.kind === 'crystal' && inp.held('KeyE', 'KeyF')) {
      this.holdTimer += dt;
      if (this.holdTimer > 0.33) {
        this.holdTimer = 0;
        this.doHarvest();
      }
    } else this.holdTimer = 0;

    for (const c of inp.clicks) {
      const it = this.world.pick(c.x, c.y);
      if (it) this.interact(it, false);
    }
  }

  private jumpTimes: number[] = [];
  private lastPos = new THREE.Vector3();
  /** Seconds the explorer has been standing still. */
  private stillTime = 0;
  private doJump(): void {
    if (this.stunned > 0) return;
    if (!this.world.player.grounded) return this.world.player.jump();
    this.audio.jump();
    this.world.player.jump();
    this.state.counters.jumps++;
    this.jumpTimes.push(this.time);
    while (this.jumpTimes.length && this.time - this.jumpTimes[0] > 10) this.jumpTimes.shift();
    if (this.jumpTimes.length >= 15) this.secret('sec_bunny');
  }

  /** Unlock a secret achievement flag (checked by afterProgress). */
  private secret(flag: string): void {
    if (this.state.flags[flag]) return;
    this.state.flags[flag] = true;
    this.afterProgress();
  }

  private interact(it: Interactable | null, fromKey: boolean): void {
    if (!it) return;
    const d = this.world.distanceTo(it, this.world.player.position);
    switch (it.kind) {
      case 'crystal':
        if (d <= (fromKey ? RANGES.harvest : RANGES.harvestClick)) this.doHarvest();
        else this.tooFar('Approche-toi du cristal pour le récolter');
        break;
      case 'site': {
        if (d > it.range + (fromKey ? 0 : 1.5)) return this.tooFar('Approche-toi du chantier pour construire (ou ouvre l’Atelier)');
        this.buyMachine(it.machine!, 1);
        break;
      }
      case 'bridge':
        if (d > it.range + (fromKey ? 0 : 1.5)) return this.tooFar('Approche-toi du panneau pour construire le pont');
        this.unlockZone(it.zone!);
        break;
      case 'lighthouse':
        this.panels.showPrestige();
        break;
      case 'golden':
        if (d <= it.range + (fromKey ? 0 : 6)) this.strikeGolden();
        else this.tooFar('Approche-toi du cristal doré');
        break;
      case 'altar':
        if (this.panels.open === this.runePanel.el && this.runePanel.family === it.family && fromKey) this.rollRunes(it.family!, false);
        else this.openRunes(it.family!);
        break;
      case 'nest':
        this.togglePanel(this.petPanel.el, () => this.petPanel.refresh());
        break;
      case 'dock':
        this.togglePanel(this.dockPanel.el, () => this.dockPanel.refresh());
        break;
      case 'merchant':
        this.togglePanel(this.merchantPanel.el, () => this.merchantPanel.refresh());
        break;
      case 'rift':
        if (d <= it.range + (fromKey ? 0 : 6)) this.strikeRift();
        else this.tooFar('Approche-toi de la faille');
        break;
      case 'crucible':
        this.openRunes(this.lastFamily);
        this.runePanel.setTab('fuse');
        break;
      case 'guardian':
        if (d <= it.range + (fromKey ? 0 : 6)) this.strikeGuardian();
        else this.tooFar('Approche-toi du gardien');
        break;
    }
  }

  private tooFar(msg: string): void {
    this.audio.error();
    this.hud.toast('hand', msg);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /** Chained strikes (cosmetic): a growing "Série ×N" label and sparks at milestones. */
  private bumpCombo(): void {
    this.combo = this.time - this.lastHitTime < 1.1 ? this.combo + 1 : 1;
    this.lastHitTime = this.time;
    const n = this.combo;
    if (n > this.state.counters.bestCombo) this.state.counters.bestCombo = n;
    // Voie de la Pioche: every 25 chained strikes, a wave of shards worth 10 strikes.
    if (pickPath(this.state) && n % 25 === 0) {
      const v = this.rates.click * 10;
      addShards(this.state, v);
      const hp = this.world.impactPoint();
      this.world.particles.sparks(hp, { count: 90, color: PALETTE.crystal, speed: 10, life: 1.2, size: 0.12, up: 5 });
      this.world.rig.shake(0.5);
      this.audio.milestone();
      this.hud.float(hp.x, hp.y + 2.6, hp.z, `Onde ! +${formatNumber(v)}${ICONS.shard}`, 'huge', 1.6);
    }
    if (n >= 5 && n % 5 === 0) {
      const hp = this.world.impactPoint();
      const big = n >= 50 ? 'huge' : n >= 20 ? 'big' : '';
      this.hud.float(hp.x - 0.8, hp.y + 1.8, hp.z, `Série ×${n}`, `text ${big}`, 1.1);
      if (n % 25 === 0) {
        this.world.particles.sparks(hp.clone().setY(hp.y + 1), { count: 30 + n, color: PALETTE.lumen, speed: 7, life: 1, size: 0.09, up: 4 });
        this.audio.achievement();
      }
    }
  }

  /** Swing the pickaxe at the crystal; the gain lands on the impact frame. */
  private doHarvest(): void {
    if (this.stunned > 0) return;
    this.state.flags.nearCrystal = true;
    this.world.player.requestStrike(this.world.crystal.position, () => {
      const forced = this.rates.phoenix && this.phoenixCharges > 0;
      if (forced) this.phoenixCharges--;
      const streak = 1 + Math.min(this.rates.streakCap, this.combo * 0.01);
      const { value: v, crit } = harvestEx(this.state, this.rates, Math.random, { forceCrit: forced, scale: streak });
      if (crit && !forced && this.rates.phoenix) {
        this.phoenixCharges = 3;
        this.world.particles.sparks(this.world.impactPoint(), { count: 40, color: 0xff7a3d, speed: 7, life: 0.9, size: 0.1, up: 4 });
        this.hud.float(this.world.impactPoint().x, this.world.impactPoint().y + 2.2, this.world.impactPoint().z, 'Phénix !', 'text lumen', 1.2);
      }
      if (this.rates.echo) this.tweens.wait(0.5).then(() => this.echoStrike());
      this.world.harvestFx(crit ? v * 3 : v);
      this.bumpCombo();
      this.audio.harvest(this.world.player.pickTierIndex);
      const hp = this.world.impactPoint();
      if (crit) {
        this.audio.crit();
        this.world.rig.shake(0.45);
        this.world.particles.sparks(hp, { count: 40, color: PALETTE.lumen, speed: 9, life: 0.9, size: 0.1, up: 3 });
        this.hud.float(hp.x, hp.y + 1.1, hp.z, `Critique ! +${formatNumber(v, 1)}${ICONS.shard}`, 'huge lumen', 1.4);
      } else this.hud.float(hp.x + (Math.random() - 0.5) * 0.6, hp.y + 0.7, hp.z + (Math.random() - 0.5) * 0.6, `+${formatNumber(v, 1)}${ICONS.shard}`, v >= 100 ? 'big' : '');
    });
  }

  private phoenixCharges = 0;
  private petPanel!: FamiliarPanel;
  private talentPanel!: TalentPanel;
  private dockPanel!: DockPanel;
  private ascPanel!: AscensionPanel;
  private merchantPanel!: MerchantPanel;
  private rift!: Rift;
  private riftIt!: Interactable;
  private merchant!: MerchantBalloon;
  private merchantIt!: Interactable;
  private nextRift = between(RIFT.first);
  private nextMerchant = between(MERCHANT.first);
  private announcedTrips = new Set<number>();
  private surgeOn = false;
  private autoBuyTimer = 0;
  private guardian!: Guardian;
  private guardianIt!: Interactable;
  private nextGuardian = -1;
  private stunned = 0;
  private fightDodges = 0;
  private waveHitDone = false;

  /** Écho de la montagne: a ghost impact half a second later, worth 50 %. */
  private echoStrike(): void {
    const { value: v } = harvestEx(this.state, this.rates, Math.random, { scale: 0.5, echo: true });
    const hp = this.world.impactPoint();
    this.world.crystal.hit();
    this.world.particles.sparks(hp, { count: 10, color: 0xc99a6c, speed: 4, life: 0.5, size: 0.07, up: 2 });
    this.audio.harvest(Math.max(0, this.world.player.pickTierIndex - 2));
    this.hud.float(hp.x + 0.5, hp.y + 0.4, hp.z, `+${formatNumber(v, 1)}`, 'small', 0.9);
  }

  buyMachine(id: MachineId, n: number): boolean {
    let bought = 0;
    const before = this.state.machines[id];
    for (let i = 0; i < n; i++) {
      if (!buyMachine(this.state, id)) break;
      bought++;
    }
    if (bought === 0) {
      this.audio.error();
      const cost = nextMachineCost(this.state, id);
      const missing = (cost.lumen ?? 0) > this.state.lumen ? 'Lumen' : 'éclats';
      const pos = this.world.sites[id].slotPosition(this.world.sites[id].nextGhostIndex >= 0 ? this.world.sites[id].nextGhostIndex : 0);
      this.hud.float(pos.x, pos.y + 2.5, pos.z, `Pas assez de ${missing}`, 'text small', 1.2);
      return false;
    }
    this.markDirty();
    const { spawned } = this.world.sync(this.state, this.rates, true);
    spawned.slice(-3).forEach((s) => this.world.spawnFx(s.machine, s.index));
    this.audio.build();
    const after = this.state.machines[id];
    const site = this.world.sites[id];
    const last = site.slotPosition(Math.min(after, site.slots.length) - 1);
    this.hud.float(last.x, last.y + MODEL_H(site.model.height), last.z, `+${bought} ${bought > 1 ? MACHINES[id].plural : MACHINES[id].name}`, 'text', 1.4);
    // Milestones crossed?
    for (const m of MILESTONES) {
      if (before < m && after >= m) {
        this.audio.milestone();
        this.hud.toast(MACHINE_ICON[id], `Palier ${m} atteint !`, `${MACHINES[id].plural} : production ×2 (total ×${milestoneMult(after)})`, 'gold');
        const c = site.slotPosition(0);
        this.world.particles.sparks(c.clone().setY(c.y + 2), { count: 60, color: PALETTE.lumen, speed: 8, life: 1.2, size: 0.12, up: 4 });
        this.world.rig.shake(0.5);
      }
    }
    this.checkObjectives();
    this.panels.refresh();
    return true;
  }

  buyUpgrade(id: string): boolean {
    if (!buyUpgrade(this.state, id)) {
      this.audio.error();
      return false;
    }
    const up = getUpgrade(id)!;
    this.markDirty();
    this.world.sync(this.state, this.rates, true);
    const tier = pickTierOf(this.state);
    if (tier !== this.world.player.pickTierIndex) {
      // New pickaxe: the explorer raises it overhead.
      this.world.player.setPickTier(tier, true);
      this.audio.pickReveal(tier);
      this.hud.toast('pick', `Nouvelle pioche : ${up.name}`, up.desc, 'gold');
    } else {
      this.audio.upgrade();
      this.hud.toast(up.icon, up.name, up.desc, 'gold');
    }
    const p = this.world.player.position;
    this.world.particles.sparks(p.clone().setY(p.y + 1.2), { count: 30, color: PALETTE.lumen, speed: 5, life: 0.9, size: 0.08, up: 3 });
    this.checkObjectives();
    this.panels.refresh();
    return true;
  }

  unlockZone(id: ZoneId): void {
    if (!unlockZone(this.state, id)) {
      this.audio.error();
      const b = this.world.bridges.get(id)!;
      const sg = b.layout.sign;
      this.hud.float(sg[0], 3, sg[1], 'Pas assez de ressources', 'text small', 1.2);
      return;
    }
    this.markDirty();
    this.panels.close();
    this.world.sync(this.state, this.rates, true);
    this.audio.build();
    this.hud.toast('bridge', `${ZONES[id].bridgeName} en construction…`, `Il mène à l’${ZONES[id].name}`, 'gold');
    // Short cinematic on the bridge being built.
    const br = this.world.bridges.get(id)!;
    const mid = br.midpoint;
    const dir = new THREE.Vector3(br.layout.to[0] - br.layout.from[0], 0, br.layout.to[1] - br.layout.from[1]).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const camPos = mid.clone().addScaledVector(side, 14).add(new THREE.Vector3(0, 7, 0)).addScaledVector(dir, -4);
    this.cinematic(camPos, mid, 3.2).then(() => {
      this.audio.bridgeDone();
      this.hud.toast('bridge', `${ZONES[id].name} accessible !`, ZONES[id].blurb, 'gold');
      this.checkObjectives();
    });
    this.checkObjectives();
  }

  // ---------------------------------------------------------------------------
  // Runes
  // ---------------------------------------------------------------------------

  private nearAltar(f: FamilyId): boolean {
    const it = this.world.interactables.find((i) => i.kind === 'altar' && i.family === f);
    return !!it && this.world.distanceTo(it, this.world.player.position) < it.range + 1.2;
  }

  private openRunes(f: FamilyId): void {
    if (!this.state.zones[FAMILIES[f].zone]) f = 'stone';
    this.lastFamily = f;
    this.runePanel.open(f);
    this.panels.show(this.runePanel.el);
  }

  /** Roll at an altar (manual: must stand next to it; auto: anywhere). */
  rollRunes(f: FamilyId, auto: boolean): RuneDef[] {
    if (!auto && !this.nearAltar(f)) {
      this.audio.error();
      return [];
    }
    if (this.rollTimer > 0 && !auto) return [];
    const got = doRoll(this.state, f);
    if (!got.length) {
      if (!auto) this.audio.error();
      return [];
    }
    this.rollTimer = cooldownOf(this.state);
    this.lastFamily = f;
    this.markDirty();
    const best = got.reduce((m, r) => Math.max(m, RARITY_INDEX[r.rarity]), 0);
    const bestDef = got.find((r) => RARITY_INDEX[r.rarity] === best)!;
    const altar = this.world.altars.get(f)!;
    const seen = altar.position.distanceTo(this.world.player.position) < 40;
    if (seen) altar.rollFx(best, got.length);
    this.audio.runeRoll(best, auto && !seen);
    if (this.panels.open === this.runePanel.el && this.runePanel.family === f) {
      this.runePanel.refresh();
      this.runePanel.showResults(got);
    }
    if (seen) {
      const at = altar.slabWorld;
      this.hud.float(at.x, at.y + 0.8, at.z, `${bestDef.name}${got.length > 1 ? ` +${got.length - 1}` : ''}`, best >= 3 ? 'big violet' : 'small violet', 1.3);
    }
    const r = RARITIES[best];
    if (r.celebrate >= 3) {
      this.celebration.show(bestDef, this.state.runes[bestDef.id]);
      this.slowMo(r.celebrate >= 4 ? 2.4 : 1.4, r.celebrate >= 4 ? 0.2 : 0.35);
      this.renderer.setFlashColor(r.color);
      this.tweens.add(1.2, (v) => (this.renderer.flash = 0.45 * (1 - v)), { ease: Ease.outCubic });
      this.world.rig.shake(r.celebrate >= 4 ? 0.9 : 0.6);
      this.audio.runeFanfare(best);
    } else if (r.celebrate === 2) {
      this.hud.toast('rune', `Rune épique : ${bestDef.name}`, runeEffect(bestDef, 1) + ' par copie', 'violet');
      this.world.rig.shake(0.3);
    } else if (r.celebrate === 1 && (auto || this.panels.open !== this.runePanel.el)) {
      this.hud.toast('rune', `Rune rare : ${bestDef.name}`, runeEffect(bestDef, 1) + ' par copie', 'ether');
    }
    this.afterProgress();
    return got;
  }

  // --- Talents -------------------------------------------------------------------

  private openAscension(toggle = false): void {
    if (!ascensionUnlocked(this.state)) return;
    if (toggle && this.panels.open === this.ascPanel.el) return this.panels.close();
    this.ascPanel.open();
    this.panels.show(this.ascPanel.el);
  }

  private openGarden(toggle = false): void {
    if (!talentsUnlocked(this.state)) return;
    if (toggle && this.panels.open === this.talentPanel.el) return this.panels.close();
    this.talentPanel.refresh();
    this.panels.show(this.talentPanel.el);
  }

  private plantTalent(id: string): boolean {
    if (!plant(this.state, id)) {
      this.audio.error();
      return false;
    }
    const def = TALENT_BY_ID.get(id)!;
    this.markDirty();
    this.audio.upgrade();
    this.hud.toast('seed', `${def.path ? 'Voie choisie' : 'Talent planté'} : ${def.name}`, def.desc, 'violet');
    const lp = this.world.lighthouse.position;
    if (this.world.player.position.distanceTo(lp) < 30) this.world.particles.sparks(lp.clone().setY(lp.y + 1), { count: 30, color: PALETTE.seed, speed: 4, life: 1, size: 0.08, up: 3 });
    if (id === 'foreman') {
      this.state.autoBuy = true;
      this.hud.toast('hammer', 'Le Contremaître prend son poste', 'Il achète tout seul les machines déjà posées, sans jamais dépenser plus de la moitié de tes éclats.', 'gold');
    }
    this.checkObjectives();
    this.afterProgress();
    return true;
  }

  // --- Familiars ----------------------------------------------------------------

  private buyEggAction(): boolean {
    if (!buyEgg(this.state)) {
      this.audio.error();
      return false;
    }
    this.audio.buy();
    this.hud.toast('egg', 'Un œuf rejoint le nid', 'Fais-le éclore au Nid d’éther.', 'ether');
    return true;
  }

  private hatchAction(): boolean {
    const pet = hatch(this.state, luckOf(this.state));
    if (!pet) {
      this.audio.error();
      return false;
    }
    this.markDirty();
    const ri = PET_RARITIES.findIndex((r) => r.id === pet.rarity);
    this.world.familiars.hatchFx();
    this.audio.hatch(ri);
    const sp = SPECIES[pet.species];
    this.hud.toast(pet.species, `${PET_RARITIES[ri].name} : ${sp.name} !`, `${sp.trait}${pet.perched ? ' Il se perche et frappe le cristal.' : ' Tous les perchoirs sont pris : il se repose au nid.'}`, ri >= 3 ? 'gold' : ri >= 2 ? 'violet' : 'ether');
    if (ri >= 3) {
      this.audio.runeFanfare(4);
      this.world.rig.shake(0.4);
    }
    this.checkObjectives();
    this.afterProgress();
    return true;
  }

  private petLevelAction(id: number): boolean {
    if (!levelUp(this.state, id)) {
      this.audio.error();
      return false;
    }
    this.audio.upgrade();
    this.markDirty();
    this.afterProgress();
    return true;
  }

  /** Fuse duplicates at the Creuset runique. */
  private fuseRune(id: string): boolean {
    const def = RUNE_BY_ID.get(id);
    const out = def ? fuse(this.state, def) : null;
    if (!out) {
      this.audio.error();
      return false;
    }
    this.markDirty();
    const ri = RARITY_INDEX[out.rarity];
    const r = RARITIES[ri];
    this.world.crucible.fuseFx(r.color, ri);
    this.audio.runeRoll(ri, this.world.crucible.position.distanceTo(this.world.player.position) > 30);
    const at = this.world.crucible.mouth;
    this.hud.float(at.x, at.y + 1.2, at.z, `${out.name}`, ri >= 3 ? 'big violet' : 'violet', 1.4);
    if (r.celebrate >= 3) {
      this.celebration.show(out, this.state.runes[out.id]);
      this.slowMo(1.2, 0.35);
      this.renderer.setFlashColor(r.color);
      this.tweens.add(1.2, (v) => (this.renderer.flash = 0.4 * (1 - v)), { ease: Ease.outCubic });
      this.audio.runeFanfare(ri);
      this.world.rig.shake(0.5);
    } else this.hud.toast('cauldron', `Fusion : ${out.name}`, `${RARITIES[ri].name} · ${runeEffect(out, 1)} par copie`, ri >= 2 ? 'violet' : 'ether');
    this.runePanel.refresh();
    this.afterProgress();
    return true;
  }

  private togglePanel(p: HTMLElement, before?: () => void): void {
    if (this.panels.open === p) return this.panels.close();
    before?.();
    this.panels.show(p);
  }

  // ---------------------------------------------------------------------------
  // Random events
  // ---------------------------------------------------------------------------

  private updateEvents(dt: number): void {
    this.updateGuardian(dt);
    this.updateLateEvents(dt);
    const p = this.world.player.position;
    this.meteors.update(dt, this.time, p, EVENTS.meteor.magnet);
    if (this.golden.update(dt, this.time)) {
      this.goldenIt.active = false;
      this.hud.toast('lumen', 'Le cristal doré s’est éteint…', 'Il reviendra. Sois plus rapide la prochaine fois !');
    }
    if (!this.started || this.busy) return;
    this.nextMeteor -= dt;
    this.nextGolden -= dt;
    if (this.nextMeteor <= 0 && this.meteors.active === 0) {
      this.nextMeteor = between(EVENTS.meteor.every);
      this.startMeteorShower();
    }
    if (this.nextGolden <= 0 && !this.golden.active && !this.guardian.visible && this.state.stats.harvests >= 10) {
      this.nextGolden = between(EVENTS.golden.every) * (hasPerk(cycleSeeds(this.state), 'goldenRush') ? 0.5 : 1);
      this.spawnGolden();
    }
  }

  // --- Expeditions, rifts, merchant ------------------------------------------------

  private shipState(i: number): 'docked' | 'away' | 'ready' {
    const e = this.state.expeditions[i];
    return !e ? 'docked' : isDone(e) ? 'ready' : 'away';
  }

  private startTrip(petId: number, dur: string): boolean {
    if (!startExpedition(this.state, this.rates, petId, dur)) {
      this.audio.error();
      return false;
    }
    this.markDirty();
    const i = this.state.expeditions.length - 1;
    this.world.dock.setShip(i, 'away');
    this.audio.bridgeDone();
    const d = EXPEDITIONS.find((x) => x.id === dur)!;
    this.hud.toast('airship', `Le dirigeable largue les amarres`, `${d.name} : retour dans ${formatDuration(d.seconds)}`, 'violet');
    this.save();
    return true;
  }

  private claimTrip(i: number): boolean {
    const e = this.state.expeditions[i];
    const res = claimExpedition(this.state, i);
    if (!res || !e) {
      this.audio.error();
      return false;
    }
    this.announcedTrips.delete(e.end);
    this.markDirty();
    // Remaining expeditions shift down: resync the ships.
    for (let k = 0; k < 2; k++) this.world.dock.setShip(k, this.shipState(k));
    this.audio.goldenBreak();
    const L = res.loot;
    const names = res.runes.map((r) => r.name).join(', ');
    this.hud.toast('airship', 'Butin d’expédition !', `+${formatNumber(L.shards)} éclats · +${formatNumber(L.lumen)} Lumen · +${L.fragments} fragments${names ? ` · ${names}` : ''}${res.egg ? ' · un œuf !' : ''}`, 'gold');
    const best = res.runes.reduce((m, r) => Math.max(m, RARITY_INDEX[r.rarity]), 0);
    const bd = res.runes.find((r) => RARITY_INDEX[r.rarity] === best);
    if (bd && RARITIES[best].celebrate >= 3) this.celebration.show(bd, this.state.runes[bd.id]);
    this.afterProgress();
    this.save();
    return true;
  }

  private updateLateEvents(dt: number): void {
    const s = this.state;
    // Finished expeditions: ships come back, one announcement each.
    s.expeditions.forEach((e, i) => {
      if (isDone(e) && !this.announcedTrips.has(e.end)) {
        this.announcedTrips.add(e.end);
        this.world.dock.setShip(i, 'ready');
        if (this.started) this.hud.toast('airship', 'Un dirigeable est de retour !', 'Récupère son butin au Quai des dirigeables.', 'gold');
      }
    });
    // Surge ("Afflux") from a closed rift.
    const surge = surgeLeft(s) > 0;
    if (surge !== this.surgeOn) {
      this.surgeOn = surge;
      this.markDirty();
      if (!surge && this.started) this.hud.toast('rift', 'L’Afflux se dissipe', 'La production revient à la normale.');
    }
    this.hud.setSurge(surge ? surgeLeft(s) : 0);
    if (this.rift.update(dt, this.time, this.world.camera)) {
      this.riftIt.active = false;
      this.hud.toast('rift', 'La faille s’est refermée seule…', 'Frappe-la plus vite la prochaine fois.');
    }
    if (this.merchant.update(dt, this.time)) {
      this.merchantIt.active = false;
      if (this.panels.open === this.merchantPanel.el) this.panels.close();
      this.hud.toast('balloon', 'Le marchand repart', 'Il reviendra.');
    }
    this.merchantPanel.timeLeft = this.merchant.timeLeft;
    if (!this.started || this.busy || !laterEventsUnlocked(s)) return;
    this.nextRift -= dt;
    this.nextMerchant -= dt;
    if (this.nextRift <= 0 && !this.rift.active && !this.guardian.visible) {
      this.nextRift = between(RIFT.every);
      const spot = this.freeSpots(1, 4, 9, 1)[0];
      if (spot) {
        this.rift.spawn(spot, RIFT.hits, RIFT.life);
        this.riftIt.sphere.center.copy(spot).setY(spot.y + 1.6);
        this.riftIt.anchor.copy(spot).setY(spot.y + 3.8);
        this.riftIt.active = true;
        this.audio.riftOpen();
        s.counters.eventsSeen++;
        this.hud.toast('rift', 'Une faille d’éther s’ouvre !', `Frappe-la ${RIFT.hits} fois pour la refermer : production ×${RIFT.surgeMult} pendant ${RIFT.surgeSeconds} s.`, 'violet');
      }
    }
    if (this.nextMerchant <= 0 && !this.merchant.active) {
      this.nextMerchant = between(MERCHANT.every);
      const spot = this.freeSpots(1, 5, 10, 2)[0];
      if (spot) {
        this.merchant.land(spot, MERCHANT.stay);
        this.merchantIt.sphere.center.copy(spot).setY(spot.y + 1);
        this.merchantIt.anchor.copy(spot).setY(spot.y + 3.4);
        this.merchantIt.active = true;
        this.merchantPanel.newVisit();
        this.audio.merchant();
        s.counters.eventsSeen++;
        this.hud.toast('balloon', 'Un marchand ambulant se pose !', `Œufs, fragments et runes contre du Lumen. Il repart dans ${formatDuration(MERCHANT.stay)}.`, 'gold');
      }
    }
  }

  private strikeRift(): void {
    if (!this.rift.active || this.stunned > 0) return;
    this.world.player.requestStrike(
      this.rift.position,
      () => {
        if (!this.rift.active) return;
        this.audio.riftHit();
        this.world.rig.shake(0.2);
        if (this.rift.hit()) {
          openSurge(this.state);
          this.riftIt.active = false;
          this.markDirty();
          this.surgeOn = true;
          this.audio.riftClose();
          this.slowMo(0.6, 0.35);
          this.renderer.setFlashColor(0xc59bff);
          this.tweens.add(0.8, (v) => (this.renderer.flash = 0.3 * (1 - v)), { ease: Ease.outCubic });
          const at = this.rift.position;
          this.hud.float(at.x, at.y + 3, at.z, `Afflux ! Production ×${RIFT.surgeMult}`, 'huge surge', 2);
          this.hud.toast('rift', 'Faille refermée : Afflux !', `Production ×${RIFT.surgeMult} pendant ${RIFT.surgeSeconds} s`, 'violet');
          this.afterProgress();
        }
      },
      2.6,
    );
  }

  private buyFromMerchant(id: OfferId): boolean {
    const got = buyOffer(this.state, this.rates, id);
    if (!got) {
      this.audio.error();
      return false;
    }
    this.audio.buy();
    this.markDirty();
    if (got !== true) this.hud.toast('rune', `Rune garantie : ${got.name}`, `${RARITIES[RARITY_INDEX[got.rarity]].name} · ${runeEffect(got, 1)} par copie`, 'violet');
    else this.hud.toast('balloon', 'Marché conclu', id === 'egg' ? 'L’œuf t’attend au Nid d’éther.' : 'Les fragments sont dans ta besace.', 'gold');
    this.afterProgress();
    return true;
  }

  // --- Crystal guardians -------------------------------------------------------

  private updateGuardian(dt: number): void {
    const g = this.guardian;
    if (g.update(dt, this.time) === 'timeout') {
      this.guardianIt.active = false;
      this.audio.guardianLeave();
      this.hud.toast('fragment', 'Le gardien est reparti sous terre…', 'Il reviendra. Frappe plus vite la prochaine fois !');
    }
    // Shockwave: grounded players inside the ring's band get stunned; jumping dodges it.
    if (g.waveRadius > 0 && !this.waveHitDone) {
      const p = this.world.player.position;
      const d = Math.hypot(p.x - g.position.x, p.z - g.position.z);
      if (Math.abs(d - g.waveRadius) < 0.55) {
        this.waveHitDone = true;
        if (this.world.player.grounded) {
          this.stunned = GUARDIAN.stun;
          this.audio.error();
          this.world.rig.shake(0.5);
          this.world.particles.sparks(p.clone().setY(p.y + 1.6), { count: 12, color: 0xfff1a8, speed: 1.5, life: GUARDIAN.stun, size: 0.08, up: 0.5, gravity: 0 });
          this.hud.float(p.x, p.y + 2.2, p.z, 'Étourdi !', 'text', 1);
        } else {
          this.fightDodges++;
          this.state.counters.dodges++;
          this.audio.dodge();
          this.hud.float(p.x, p.y + 2.2, p.z, 'Esquivé !', 'text lumen', 1);
          if (this.fightDodges >= 5) this.secret('sec_dodger');
        }
      }
    }
    if (g.active) {
      this.guardianIt.sphere.center.copy(g.position).setY(g.position.y + 1.4);
      this.guardianIt.anchor.copy(g.position).setY(g.position.y + 3.6);
      const windup = g.waveRadius > 0 || g.winding;
      this.hud.setBoss({
        name: 'Gardien de cristal',
        hp: g.hp,
        max: g.maxHp,
        time: g.timeLeft,
        hint: windup ? 'Il frappe le sol : SAUTE (Espace) !' : this.stunned > 0 ? 'Étourdi…' : this.input.isTouch ? 'Touche-le pour le frapper · saute quand il frappe le sol' : 'Clic ou E pour frapper · Espace pour sauter l’onde de choc',
        danger: windup,
      });
    } else this.hud.setBoss(null);

    if (!this.started || this.busy || !guardiansUnlocked(this.state)) return;
    if (this.nextGuardian < 0) this.nextGuardian = between(this.state.counters.guardians === 0 ? GUARDIAN.first : GUARDIAN.every);
    if (g.visible) return;
    this.nextGuardian -= dt * (isNight(this.state) ? GUARDIAN.nightRate : 1);
    if (this.nextGuardian <= 0 && !this.golden.active) this.spawnGuardian();
  }

  spawnGuardian(): void {
    const spot = this.freeSpots(1, 5, 12, 2.2)[0] ?? this.freeSpots(1, 4, 14, 1.4)[0];
    if (!spot) return;
    this.nextGuardian = between(GUARDIAN.every);
    this.guardian.spawn(spot, this.world.player.position, GUARDIAN.hp, GUARDIAN.time + guardianBonusTime(this.state));
    this.guardianIt.active = true;
    this.fightDodges = 0;
    this.audio.guardianAppear();
    this.world.rig.shake(0.4);
    this.state.counters.eventsSeen++;
    const first = this.state.counters.guardians === 0 && !this.state.flags.guardianSeen;
    this.state.flags.guardianSeen = true;
    this.hud.toast('fragment', first ? 'Un gardien de cristal surgit !' : 'Gardien de cristal !', first ? `Brise-le à la pioche en ${GUARDIAN.time} s. Quand il frappe le sol, saute pour éviter l’onde de choc. Il lâche des fragments de rune.` : `${GUARDIAN.time} s pour le briser`, 'ether');
  }

  private strikeGuardian(): void {
    const g = this.guardian;
    if (!g.active || this.stunned > 0) return;
    this.world.player.requestStrike(
      g.position,
      () => {
        if (!g.active) return;
        const forced = this.rates.phoenix && this.phoenixCharges > 0;
        if (forced) this.phoenixCharges--;
        const crit = forced || (this.rates.critChance > 0 && Math.random() < this.rates.critChance);
        if (crit && !forced && this.rates.phoenix) this.phoenixCharges = 3;
        const small = this.rates.click * GUARDIAN.hitClicks * (crit ? 2 : 1);
        addShards(this.state, small);
        this.bumpCombo();
        this.audio.guardianHit(crit);
        this.world.rig.shake(crit ? 0.3 : 0.15);
        const at = g.impactPoint(this.world.player.position);
        this.hud.float(at.x, at.y + 0.8, at.z, crit ? `−2 · critique !` : '−1', crit ? 'big lumen' : 'small', 0.9);
        if (g.hit(crit ? 2 : 1, this.world.player.position)) this.defeatGuardian();
      },
      2.3,
    );
  }

  private defeatGuardian(): void {
    const g = this.guardian;
    const loot = defeatGuardian(this.state, this.rates, g.elapsed);
    this.guardianIt.active = false;
    this.markDirty();
    this.audio.guardianBreak();
    this.slowMo(0.9, 0.3);
    this.world.rig.shake(0.8);
    this.renderer.setFlashColor(0xf08cb0);
    this.tweens.add(0.9, (v) => (this.renderer.flash = 0.35 * (1 - v)), { ease: Ease.outCubic });
    const at = g.position;
    this.hud.float(at.x, at.y + 3.2, at.z, `+${loot.fragments} ${ICONS.fragment}`, 'huge', 2);
    this.hud.float(at.x + 1, at.y + 2.4, at.z, `+${formatNumber(loot.shards)}${ICONS.shard}`, 'big', 1.8);
    const best = loot.runes.reduce((m, r) => Math.max(m, RARITY_INDEX[r.rarity]), 0);
    const bestDef = loot.runes.find((r) => RARITY_INDEX[r.rarity] === best)!;
    const names = loot.runes.map((r) => r.name).join(', ');
    this.hud.toast('fragment', `Gardien brisé en ${formatDuration(g.elapsed)} !`, `+${loot.fragments} fragments de rune · ${names}`, 'gold');
    if (RARITIES[best].celebrate >= 3) {
      this.celebration.show(bestDef, this.state.runes[bestDef.id]);
      this.audio.runeFanfare(best);
    }
    if (loot.egg) window.setTimeout(() => this.hud.toast('egg', 'Le gardien gardait un œuf !', 'Il t’attend au Nid d’éther.', 'ether'), 1500);
    if (this.state.counters.guardians === 1) window.setTimeout(() => this.hud.toast('cauldron', 'Le Creuset runique s’allume', 'Près du Nexus : fusionne 5 copies d’une rune avec des fragments pour obtenir la rareté supérieure.', 'violet'), 2500);
    this.afterProgress();
  }

  /** Random free spots on solid ground around the player. */
  private freeSpots(n: number, minR: number, maxR: number, clearance = 0): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const p = this.world.player.position;
    const g = this.world.ground;
    for (let tries = 0; tries < n * 40 && out.length < n; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = minR + Math.random() * (maxR - minR);
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (!g.walkable(x, z) || g.overlap(x, z) > 0 || g.bridgeAt(x, z)) continue;
      if (clearance > 0) {
        let ok = true;
        for (let k = 0; k < 8 && ok; k++) {
          const ka = (k / 8) * Math.PI * 2;
          const qx = x + Math.cos(ka) * clearance;
          const qz = z + Math.sin(ka) * clearance;
          if (!g.walkable(qx, qz) || g.bridgeAt(qx, qz)) ok = false;
        }
        if (!ok) continue;
      }
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2)) continue;
      out.push(new THREE.Vector3(x, g.heightAt(x, z), z));
    }
    return out;
  }

  private startMeteorShower(): void {
    const zones = Object.values(this.state.zones).filter(Boolean).length;
    const spots = this.freeSpots(EVENTS.meteor.count + zones * EVENTS.meteor.perZone, 4, 16);
    if (!spots.length) return;
    this.meteors.spawn(spots, EVENTS.meteor.life);
    this.audio.meteorShower();
    this.hud.toast('meteor', 'Pluie de météores !', 'Ramasse les éclats tombés du ciel avant qu’ils ne s’éteignent.', 'ether');
    this.state.counters.eventsSeen++;
  }

  private collectMeteor(at: THREE.Vector3): void {
    const v = Math.max(10, this.rates.shards * EVENTS.meteor.rewardSeconds + this.rates.click * EVENTS.meteor.rewardClicks);
    addShards(this.state, v);
    this.state.counters.meteors++;
    this.audio.pickup();
    this.hud.float(at.x, at.y + 1.2, at.z, `+${formatNumber(v)}${ICONS.shard}`, 'big', 1.2);
    this.afterProgress();
  }

  private spawnGolden(): void {
    const spot = this.freeSpots(1, 5, 11)[0];
    if (!spot) return;
    this.golden.spawn(spot, EVENTS.golden.hits, EVENTS.golden.time);
    this.goldenIt.anchor.copy(spot).setY(spot.y + 3.2);
    this.goldenIt.sphere.center.copy(spot).setY(spot.y + 1.1);
    this.goldenIt.active = true;
    this.audio.goldenAppear();
    this.hud.toast('lumen', 'Un cristal doré est apparu !', `Frappe-le ${EVENTS.golden.hits} fois en ${EVENTS.golden.time} s pour un gros butin.`, 'gold');
    this.state.counters.eventsSeen++;
  }

  private strikeGolden(): void {
    if (!this.golden.active || this.stunned > 0) return;
    this.world.player.requestStrike(
      this.golden.position,
      () => {
        if (!this.golden.active) return;
        const small = this.rates.click * EVENTS.golden.hitClicks;
        addShards(this.state, small);
        this.audio.harvest(this.world.player.pickTierIndex + 1);
        this.world.rig.shake(0.15);
        const at = this.golden.position;
        this.hud.float(at.x, at.y + 2.6, at.z, `+${formatNumber(small)}${ICONS.shard}`, 'lumen', 1);
        if (this.golden.hit()) {
          const big = Math.max(100, this.rates.shards * EVENTS.golden.rewardSeconds + this.rates.click * 40);
          const lum = this.rates.lumen * EVENTS.golden.rewardSeconds * 0.5;
          addShards(this.state, big);
          if (lum > 0) addLumen(this.state, lum);
          this.state.counters.golden++;
          if (this.meteors.active > 0) this.state.flags.sec_doubleEvent = true;
          this.goldenIt.active = false;
          this.audio.goldenBreak();
          this.world.rig.shake(0.6);
          this.hud.float(at.x, at.y + 3.2, at.z, `+${formatNumber(big)}${ICONS.shard}`, 'huge lumen', 2);
          this.hud.toast('lumen', 'Cristal doré brisé !', `+${formatNumber(big)} éclats${lum > 0 ? ` et +${formatNumber(lum)} Lumen` : ''}`, 'gold');
          this.afterProgress();
        }
      },
      1.9,
    );
  }

  /** Brief slow motion, easing back to normal speed. */
  private slowMo(seconds: number, scale: number): void {
    this.timeScale = scale;
    window.setTimeout(() => {
      const start = performance.now();
      const ease = () => {
        const k = Math.min(1, (performance.now() - start) / 500);
        this.timeScale = scale + (1 - scale) * k;
        if (k < 1) requestAnimationFrame(ease);
      };
      ease();
    }, seconds * 1000);
  }

  private buyAltar(id: 'luck' | 'bulk' | 'speed' | 'auto'): boolean {
    if (!buyAltarUpgrade(this.state, id)) {
      this.audio.error();
      return false;
    }
    if (id === 'auto' && !this.state.runeAuto) this.state.runeAuto = this.runePanel.family;
    this.audio.upgrade();
    this.markDirty();
    this.afterProgress();
    return true;
  }

  /** Achievements & objectives after anything that changes progress. */
  private afterProgress(): void {
    const got = checkAchievements(this.state);
    if (!got.length) return;
    this.markDirty();
    this.audio.achievement();
    // Several tiers at once (e.g. after a big jump): one toast per achievement, highest tier.
    const best = new Map<string, AchievementUnlock>();
    for (const u of got) best.set(u.def.id, u);
    for (const u of best.values()) {
      const d = u.def;
      const tier = d.goals.length > 1 ? ` (${TIER_NAMES[u.tier - 1]})` : '';
      this.hud.toast('trophy', `Succès : ${d.name}${tier}`, `${achievementDesc(d, u.tier - 1)} · ${runeEffectText(d.stat, d.values[u.tier - 1])} pour toujours`, u.tier >= 3 ? 'gold' : u.tier === 2 ? 'ether' : 'gold');
    }
  }

  private async cinematic(pos: THREE.Vector3, look: THREE.Vector3, hold: number): Promise<void> {
    this.busy = true;
    const rig = this.world.rig;
    rig.cinematic = { pos, look, weight: 0 };
    const c = rig.cinematic;
    await new Promise<void>((r) => this.tweens.add(1.0, (v) => (c.weight = v), { ease: Ease.inOutCubic, done: r }));
    await this.tweens.wait(hold);
    await new Promise<void>((r) => this.tweens.add(1.0, (v) => (c.weight = 1 - v), { ease: Ease.inOutCubic, done: r }));
    rig.cinematic = null;
    this.busy = false;
  }

  private goTo(kind: 'site' | 'bridge', key: string): void {
    this.panels.close();
    this.forcedTarget = { kind, key, until: this.time + 25 };
    const name = kind === 'site' ? MACHINES[key as MachineId].name : ZONES[key as ZoneId].bridgeName;
    this.hud.toast('hand', `Suis la balise jusqu’au chantier`, kind === 'site' ? `Pose ta première ${name.toLowerCase()} sur place` : name);
  }
  private forcedTarget: { kind: 'site' | 'bridge'; key: string; until: number } | null = null;

  private async prestige(): Promise<void> {
    if (!canPrestige(this.state) || this.busy) return;
    if (isNight(this.state)) this.state.flags.sec_nightDescent = true;
    this.busy = true;
    this.panels.close();
    this.hud.show(false);
    const gain = prestigeGain(this.state);
    const rig = this.world.rig;
    const look = new THREE.Vector3(0, 0, -14);
    rig.cinematic = { pos: new THREE.Vector3(48, 30, 30), look, weight: 0 };
    const c = rig.cinematic;
    await new Promise<void>((r) => this.tweens.add(1.6, (v) => (c.weight = v), { ease: Ease.inOutCubic, done: r }));
    this.audio.prestige();
    this.world.lighthouse.setAwake(true);
    this.renderer.setFlashColor(PALETTE.seed);
    this.world.particles.sparks(this.world.lighthouse.topPosition, { count: 120, color: PALETTE.seed, speed: 12, life: 2, size: 0.18, up: 4, gravity: 2 });
    this.world.player.root.visible = false;
    const descend = this.world.descend();
    this.tweens.add(2.6, (v) => (this.renderer.flash = Math.pow(v, 3) * 0.85), { ease: Ease.linear });
    await descend;

    doPrestige(this.state);
    this.markDirty();
    this.world.regrow(this.state.islandSeed);
    this.world.resetForNewIsland(this.state);
    this.world.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw, this.world.ground);
    this.world.player.setGlow(PALETTE.seed);
    this.world.player.setPickTier(pickTierOf(this.state));
    rig.yaw = SPAWN.yaw;
    rig.pitch = 0.5;
    const rise = this.world.rise();
    this.tweens.add(1.6, (v) => (this.renderer.flash = 0.85 * (1 - v)), { ease: Ease.outCubic });
    await rise;
    this.world.player.root.visible = true;
    this.world.particles.sparks(this.world.player.position.clone().setY(1), { count: 80, color: PALETTE.seed, speed: 7, life: 1.4, size: 0.12, up: 4 });
    rig.target.copy(this.world.player.position).add(new THREE.Vector3(0, 1.3, 0));
    await new Promise<void>((r) => this.tweens.add(1.6, (v) => (c.weight = 1 - v), { ease: Ease.inOutCubic, done: r }));
    rig.cinematic = null;
    this.busy = false;
    this.hud.show(true);
    this.audio.welcome();
    this.hud.toast('seed', `+${gain} Graine${gain > 1 ? 's' : ''} d’étoile`, `Une nouvelle île est née. Production +${Math.round((prestigeMult(this.state.seeds) - 1) * 100)} % pour toujours.`, 'violet');
    if (this.state.stats.prestiges === 1) {
      window.setTimeout(() => this.hud.toast('seed', 'Le Jardin d’étoiles s’ouvre', 'Plante tes graines dans des talents (touche T).', 'violet'), 4500);
      window.setTimeout(() => this.hud.toast('airship', 'Nouveau : le Quai des dirigeables', 'Au bord de l’Île Mère : envoie tes familiers en expédition. Failles d’éther et marchands visitent désormais l’archipel.', 'gold'), 9000);
    }
    for (let i = 0; i < 2; i++) this.world.dock.snapShip(i, this.shipState(i));
    this.save();
  }

  /** Ascension: the archipelago rises above the clouds, then a new cycle begins. */
  private async ascend(): Promise<void> {
    if (!canAscend(this.state) || this.busy) return;
    this.busy = true;
    this.panels.close();
    this.hud.show(false);
    const rig = this.world.rig;
    rig.cinematic = { pos: new THREE.Vector3(52, 22, 34), look: new THREE.Vector3(0, 6, -14), weight: 0 };
    const c = rig.cinematic;
    await new Promise<void>((r) => this.tweens.add(1.6, (v) => (c.weight = v), { ease: Ease.inOutCubic, done: r }));
    this.audio.ascension();
    this.renderer.setFlashColor(PALETTE.lumen);
    this.world.particles.sparks(this.world.lighthouse.topPosition, { count: 160, color: PALETTE.lumen, speed: 14, life: 2.2, size: 0.2, up: 6, gravity: 1 });
    this.world.player.root.visible = false;
    const up = this.world.ascendUp();
    this.tweens.add(2.8, (v) => (this.renderer.flash = Math.pow(v, 2.5) * 0.95), { ease: Ease.linear });
    await up;
    const gain = doAscend(this.state);
    this.markDirty();
    this.world.regrow(this.state.islandSeed);
    this.world.resetForNewIsland(this.state);
    this.world.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw, this.world.ground);
    this.world.player.setPickTier(pickTierOf(this.state));
    rig.yaw = SPAWN.yaw;
    rig.pitch = 0.5;
    const rise = this.world.rise();
    this.tweens.add(2, (v) => (this.renderer.flash = 0.95 * (1 - v)), { ease: Ease.outCubic });
    await rise;
    this.world.player.root.visible = true;
    rig.target.copy(this.world.player.position).add(new THREE.Vector3(0, 1.3, 0));
    await new Promise<void>((r) => this.tweens.add(1.6, (v) => (c.weight = 1 - v), { ease: Ease.inOutCubic, done: r }));
    rig.cinematic = null;
    this.busy = false;
    this.hud.show(true);
    this.audio.welcome();
    this.hud.toast('crown', `Ascension ! +${gain} couronne${gain > 1 ? 's' : ''} d’éther`, 'Reliques et défis s’ouvrent au Phare. Un nouveau cycle commence, plus fort.', 'gold');
    for (let i = 0; i < 2; i++) this.world.dock.snapShip(i, this.shipState(i));
    this.afterProgress();
    this.save();
  }

  /** Enter a challenge: quick flash, the island restarts under its constraint. */
  private startChallengeAction(id: ChallengeId): void {
    if (this.busy || !startChallenge(this.state, id)) {
      this.audio.error();
      return;
    }
    this.panels.close();
    this.markDirty();
    this.renderer.setFlashColor(PALETTE.seed);
    this.tweens.add(1.2, (v) => (this.renderer.flash = 0.7 * (1 - v)), { ease: Ease.outCubic });
    this.world.regrow(this.state.islandSeed);
    this.world.resetForNewIsland(this.state);
    this.world.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw, this.world.ground);
    this.world.player.setPickTier(pickTierOf(this.state));
    this.audio.prestige();
    const c = CHALLENGES.find((x) => x.id === id)!;
    this.hud.toast('crown', `Défi : ${c.name}`, `${c.rule} Éveille le Phare pour : ${c.reward}.`, 'violet');
    this.save();
  }

  // ---------------------------------------------------------------------------
  // Objectives
  // ---------------------------------------------------------------------------

  private currentObjective(): Objective | null {
    return OBJECTIVES[this.state.objective] ?? null;
  }

  private checkObjectives(): void {
    let guard = 0;
    while (guard++ < OBJECTIVES.length) {
      const o = this.currentObjective();
      if (!o) return;
      const [c, g] = o.progress(this.state, this.rates);
      if (c < g) return;
      this.state.objective++;
      if (o.reward?.shards) this.state.shards += o.reward.shards;
      if (o.reward?.lumen) this.state.lumen += o.reward.lumen;
      // Silent skip of objectives already done (e.g. after a prestige).
      if (this.started) {
        this.audio.objective();
        this.hud.objectiveDone();
        const reward = o.reward ? ` · récompense ${o.reward.shards ? `+${o.reward.shards} éclats` : ''}${o.reward.lumen ? `+${o.reward.lumen} lumen` : ''}` : '';
        this.hud.toast('star', 'Objectif accompli !', o.text + reward, 'gold');
      }
    }
  }

  /** The goal shown at the top once the scripted tutorial is over. */
  private dynamicGoal(): { text: string; hint: string; cur: number; goal: number; label: string; target: ObjectiveTarget } | null {
    const s = this.state;
    const ch = s.ascension.challenge;
    if (ch) {
      const c = CHALLENGES.find((x) => x.id === ch)!;
      const g = islandThreshold(s);
      return { text: `Défi « ${c.name} » : éveille le Phare`, hint: c.rule, cur: s.stats.runShards, goal: g, label: `${formatNumber(s.stats.runShards)} / ${formatNumber(g)}`, target: { kind: 'lighthouse' } };
    }
    const next = ZONE_ORDER.find((z) => !s.zones[z]);
    if (next) {
      const z = ZONES[next];
      const c = z.cost;
      const prog = Math.min(c.shards ? s.shards / c.shards : 1, c.lumen ? s.lumen / c.lumen : 1);
      const t = timeToAfford(s, this.rates, c);
      return { text: `Construis le ${z.bridgeName}`, hint: z.blurb, cur: Math.min(1, prog), goal: 1, label: `${costHtml(c)}${isFinite(t) && t > 0 ? ` · dans ${formatDuration(t)}` : ''}`, target: { kind: 'bridge', zone: next } };
    }
    if (!canPrestige(s)) {
      return { text: `Éveille le Phare : ${formatNumber(islandThreshold(s))} éclats sur cette île`, hint: 'Continue d’agrandir ta production', cur: s.stats.runShards, goal: islandThreshold(s), label: `${formatNumber(s.stats.runShards)} / ${formatNumber(islandThreshold(s))}`, target: { kind: 'lighthouse' } };
    }
    return { text: 'Le Phare est éveillé !', hint: `Fais descendre l’île pour gagner ${prestigeGain(s)} graines d’étoile (ou continue pour en gagner plus)`, cur: 1, goal: 1, label: '', target: { kind: 'lighthouse' } };
  }

  // ---------------------------------------------------------------------------
  // UI refresh
  // ---------------------------------------------------------------------------

  private updateUi(dt: number): void {
    const s = this.state;
    const r = this.rates;
    this.hud.setResources(s.shards, r.shards, s.lumen, r.lumen, s.seeds, s.zones.forge || s.lumen > 0, (prestigeMult(s.seeds) - 1) * 100);
    this.hud.setFragments(s.fragments, s.fragments > 0 || s.counters.guardians > 0);

    this.uiTimer += dt;
    const slow = this.uiTimer > 0.2;
    if (slow) {
      this.uiTimer = 0;
      this.checkObjectives();
      this.panels.refresh();
      if (this.panels.open === this.runePanel.el) this.runePanel.refresh();
      if (this.panels.open === this.journal.el) this.journal.refresh();
      if (this.panels.open === this.petPanel.el) this.petPanel.refresh();
      if (this.panels.open === this.dockPanel.el) this.dockPanel.refresh();
      if (this.panels.open === this.ascPanel.el) this.ascPanel.refresh();
      this.hud.ascBtn.classList.toggle('hide', !ascensionUnlocked(s));
      this.hud.ascBtn.classList.toggle('glow', canAscend(s));
      const won = checkChallenge(s);
      if (won) {
        const c = CHALLENGES.find((x) => x.id === won)!;
        this.markDirty();
        this.audio.runeFanfare(5);
        this.renderer.setFlashColor(PALETTE.lumen);
        this.tweens.add(1.2, (v) => (this.renderer.flash = 0.4 * (1 - v)), { ease: Ease.outCubic });
        this.hud.toast('trophy', `Défi réussi : ${c.name} !`, `${c.reward}. L’île continue sans contrainte.`, 'gold');
        this.afterProgress();
      }
      if (s.ascension.autoPrestige && s.ascension.relics.autoPrestige && canPrestige(s) && prestigeGain(s) >= Math.max(1, s.seeds) && !this.busy && !this.panels.isOpen()) void this.prestige();
      if (this.panels.open === this.merchantPanel.el) this.merchantPanel.refresh();
      this.hud.petsBtn.classList.toggle('hide', !familiarsUnlocked(this.state));
      this.hud.gardenBtn.classList.toggle('hide', !talentsUnlocked(this.state));
      this.hud.gardenBtn.classList.toggle('glow', seedsFree(this.state) > 0 && TALENTS.some((t) => canPlant(this.state, t)));
      this.world.lighthouse.setGarden(Object.values(this.state.talents).reduce((a, b) => a + b, 0));
      if (this.panels.open === this.talentPanel.el) this.talentPanel.refresh();
      this.hud.runesBtn.classList.toggle('hide', this.state.runeStats.rolls === 0 && !this.state.flags.migratedV2);
      if (s.shards >= 25000 && s.machines.excavator === 0) s.flags.sec_miser = true;
      this.afterProgress();
      const ready = canPrestige(s);
      this.world.lighthouse.setAwake(ready);
      this.world.lighthouse.setStars(CONSTELLATIONS.filter((c) => cycleSeeds(s) >= c.seeds).length);
      this.hud.setPrestige(s.zones.sky, ready);
    }

    // Objective + beacon.
    const o = this.currentObjective();
    let target: ObjectiveTarget = { kind: 'none' };
    if (o) {
      const [c, g] = o.progress(s, r);
      const text = this.input.isTouch && o.touchText ? o.touchText : o.text;
      const label = g > 1 ? (g >= 1000 ? `${formatNumber(c)} / ${formatNumber(g)}` : `${Math.floor(c)} / ${g}`) : '';
      this.hud.setObjective(text, (this.input.isTouch && o.touchHint) || o.hint || '', c, g, label);
      target = o.target;
      if (o.id !== this.lastObjectiveId) this.lastObjectiveId = o.id;
    } else {
      const d = this.dynamicGoal();
      if (d) {
        this.hud.setObjective(d.text, d.hint, d.cur, d.goal, d.label);
        target = d.target;
      } else this.hud.setObjective(null, '', 0, 1, '');
    }
    if (this.forcedTarget) {
      if (this.time > this.forcedTarget.until || (this.forcedTarget.kind === 'site' && s.machines[this.forcedTarget.key as MachineId] > 0)) this.forcedTarget = null;
      else target = this.forcedTarget.kind === 'site' ? { kind: 'site', machine: this.forcedTarget.key as MachineId } : { kind: 'bridge', zone: this.forcedTarget.key as ZoneId };
    }
    this.hud.setWorkshopBadge(this.panels.affordableUpgrades(), target.kind === 'ui' && !this.panels.isOpen());
    this.updateBeacon(target);

    // Prompt + tooltip.
    if (!this.started || this.busy) {
      this.hud.setPrompt(null);
      this.hud.setTip(null);
      this.hud.setCompass(null);
      return;
    }
    const near = this.near;
    this.hud.setPrompt(near ? this.promptFor(near) : null);
    this.hud.setActionButton(!!near, near ? this.actionLabel(near) : 'Action');

    this.hoverTimer -= dt;
    if (this.hoverTimer <= 0 && !this.input.isTouch) {
      this.hoverTimer = 0.08;
      const pt = this.input.pointer;
      this.hovered = pt.inside && !this.input.dragging ? this.world.pick(pt.x, pt.y) : null;
      this.canvas.style.cursor = this.hovered ? 'pointer' : '';
    }
    // The crystal never gets a proximity tooltip: it would hide what you are hitting.
    const tipFor = this.hovered ?? (near && near.kind !== 'crystal' ? near : null);
    if (tipFor && !this.panels.isOpen()) {
      this.world.project(tipFor.anchor, this.tmpScreen);
      if (this.tmpScreen.visible) this.hud.setTip(this.tooltipFor(tipFor), this.tmpScreen.x, this.tmpScreen.y);
      else this.hud.setTip(null);
    } else this.hud.setTip(null);
  }

  private updateBeacon(target: ObjectiveTarget): void {
    let pos: THREE.Vector3 | null = null;
    let h = 3.2;
    if (this.golden.active) target = { kind: 'golden' } as unknown as ObjectiveTarget;
    if (this.guardian.active) target = { kind: 'guardian' } as unknown as ObjectiveTarget;
    else if (this.rift.active) target = { kind: 'rift' } as unknown as ObjectiveTarget;
    switch (target.kind) {
      case 'crystal':
        pos = this.world.beaconTarget('crystal');
        h = 4.6;
        break;
      case 'site':
        if (this.state.zones[MACHINES[target.machine].zone]) {
          pos = this.world.beaconTarget('site', target.machine);
          h = this.world.sites[target.machine].model.height + 1.2;
        }
        break;
      case 'bridge':
        pos = this.world.beaconTarget('bridge', target.zone);
        h = 3.2;
        break;
      case 'lighthouse':
        if (this.state.zones.sky) {
          pos = this.world.beaconTarget('lighthouse');
          h = 12;
        }
        break;
      case 'altar':
        pos = this.world.beaconTarget('altar', target.family);
        h = 4.6;
        break;
      case 'nest':
        pos = this.world.beaconTarget('nest');
        h = 5.4;
        break;
      default:
        if ((target as { kind: string }).kind === 'golden') {
          pos = this.golden.position.clone();
          h = 3.6;
        }
        if ((target as { kind: string }).kind === 'rift') {
          pos = this.rift.position.clone();
          h = 4.4;
        }
        if ((target as { kind: string }).kind === 'guardian') {
          pos = this.guardian.position.clone();
          h = 4.2;
        }
    }
    // Hide when the player is already there.
    if (pos && Math.hypot(pos.x - this.world.player.position.x, pos.z - this.world.player.position.z) < 3.2) pos = null;
    this.world.beacon.show(pos, h);
    const wt = this.world.beacon.worldTarget;
    if (wt && this.started && !this.busy) {
      const v = wt.clone().add(new THREE.Vector3(0, 1.5, 0)).project(this.world.camera);
      const behind = v.z > 1;
      this.hud.setCompass({ x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, behind });
    } else this.hud.setCompass(null);
  }

  private actionLabel(it: Interactable): string {
    if (it.kind === 'crystal' || it.kind === 'golden' || it.kind === 'guardian') return 'Frapper';
    if (it.kind === 'crucible') return 'Creuset';
    if (it.kind === 'nest') return 'Nid';
    if (it.kind === 'dock') return 'Quai';
    if (it.kind === 'merchant') return 'Marchand';
    if (it.kind === 'rift') return 'Frapper';
    if (it.kind === 'altar') return 'Runes';
    if (it.kind === 'site' || it.kind === 'bridge') return 'Construire';
    return 'Phare';
  }

  private keyCap(): string {
    return this.input.isTouch ? '' : '<kbd>E</kbd>';
  }

  private promptFor(it: Interactable): string {
    const s = this.state;
    const have = { shards: s.shards, lumen: s.lumen };
    switch (it.kind) {
      case 'crystal':
        return `${this.keyCap()} Récolter <span class="cost">+${formatNumber(this.rates.click, 1)} ${ICONS.shard}</span>`;
      case 'site': {
        const id = it.machine!;
        const cost = nextMachineCost(s, id);
        return `${this.keyCap()} Construire : ${MACHINES[id].name} <span class="cost ${canAfford(s, cost) ? '' : 'no'}">${costHtml(cost, have)}</span>`;
      }
      case 'bridge': {
        const z = ZONES[it.zone!];
        return `${this.keyCap()} Construire le ${z.bridgeName} <span class="cost ${canAfford(s, z.cost) ? '' : 'no'}">${costHtml(z.cost, have)}</span>`;
      }
      case 'lighthouse':
        return `${this.keyCap()} Parler au Phare`;
      case 'golden':
        return `${this.keyCap()} Frapper le cristal doré <span class="cost">${this.golden.hits}/${this.golden.maxHits}</span>`;
      case 'altar': {
        const f = FAMILIES[it.family!];
        if (f.nightOnly && !isNight(s)) return `${f.altarName} <span class="cost">endormi · s’éveille dans ${formatDuration(secondsToNight(s))}</span>`;
        return `${this.keyCap()} ${f.altarName} <span class="cost">${costHtml(rollCostOf(s, it.family!), have)} / tirage</span>`;
      }
      case 'dock': {
        const ready = s.expeditions.filter((e) => isDone(e)).length;
        return `${this.keyCap()} Quai des dirigeables <span class="cost">${ready ? `${ready} butin${ready > 1 ? 's' : ''} à récupérer` : `${s.expeditions.length}/${EXPEDITION.slots} en voyage`}</span>`;
      }
      case 'merchant':
        return `${this.keyCap()} Marchand ambulant <span class="cost">repart dans ${Math.ceil(this.merchant.timeLeft)} s</span>`;
      case 'rift':
        return `${this.keyCap()} Refermer la faille <span class="cost">${this.rift.hits}/${this.rift.maxHits} · ${Math.ceil(this.rift.timeLeft)} s</span>`;
      case 'nest':
        return `${this.keyCap()} Nid d’éther <span class="cost">${s.eggs > 0 ? `${s.eggs} œuf${s.eggs > 1 ? 's' : ''} à faire éclore` : `${s.pets.length} familier${s.pets.length > 1 ? 's' : ''}`}</span>`;
      case 'crucible':
        return `${this.keyCap()} Creuset runique <span class="cost">${ICONS.fragment}${formatNumber(Math.floor(s.fragments))}</span>`;
      case 'guardian':
        return `${this.keyCap()} Frapper le gardien <span class="cost">${this.guardian.hp} PV · ${Math.ceil(this.guardian.timeLeft)} s</span>`;
    }
  }

  private tooltipFor(it: Interactable): string {
    const s = this.state;
    const r = this.rates;
    const have = { shards: s.shards, lumen: s.lumen };
    const near = this.world.distanceTo(it, this.world.player.position) < it.range;
    const act = (verb: string) => (near ? `${this.keyCap() || 'Action'} ${verb}` : `<span style="color:var(--muted)">Approche-toi pour ${verb.toLowerCase()}</span>`);
    switch (it.kind) {
      case 'crystal':
        return `<h3>${ICONS.shard} Cristal d’éther</h3>
          <p>Frappe-le avec ta pioche pour récolter des éclats.</p>
          <div class="kv"><span>Par coup</span><b>+${formatNumber(r.click, 1)} ${ICONS.shard}</b></div>
          <div class="foot">${near ? `${this.keyCap()} ou clic : récolter` : 'Clic : récolter (de près)'}</div>`;
      case 'site': {
        const id = it.machine!;
        const def = MACHINES[id];
        const n = s.machines[id];
        const pm = r.perMachine[id];
        const cost = nextMachineCost(s, id);
        const ms = nextMilestone(n);
        const prevMs = [...MILESTONES].reverse().find((m) => m <= n) ?? 0;
        const rows: string[] = [];
        if (id === 'refinery') {
          rows.push(`<div class="kv"><span>Production</span><b>+${formatRate(pm.lumen)} ${ICONS.lumen}/s</b></div>`);
          rows.push(`<div class="kv"><span>Consomme</span><b>${formatRate(pm.processed)} ${ICONS.shard}/s</b></div>`);
          if (r.refineSupplyLimited) rows.push(`<div class="warn">Les raffineries manquent d’éclats : elles ne prennent jamais plus de 50 % de ta production. Construis des foreuses !</div>`);
        } else {
          rows.push(`<div class="kv"><span>Production totale</span><b>+${formatRate(pm.shards)} ${ICONS.shard}/s</b></div>`);
          if (pm.lumen > 0) rows.push(`<div class="kv"><span>Lumen</span><b>+${formatRate(pm.lumen)} ${ICONS.lumen}/s</b></div>`);
          if (n > 0) rows.push(`<div class="kv"><span>Part de ton île</span><b>${Math.round(pm.share * 100)} %</b></div>`);
        }
        const msHtml = ms ? `<div class="kv"><span>Palier ${ms} → production ×2</span><b>${n}/${ms}</b></div><div class="ms"><i style="width:${((n - prevMs) / (ms - prevMs)) * 100}%"></i></div>` : '';
        const t = timeToAfford(s, r, cost);
        return `<h3>${ICONS[MACHINE_ICON[id]]} ${def.name} <span class="count">${n > 0 ? '×' + n : ''}</span></h3>
          <p>${def.blurb}</p>
          ${rows.join('')}${msHtml}
          <div class="foot">${act('Construire')} <span class="cost" style="margin-left:auto">${costHtml(cost, have)}</span></div>
          ${!canAfford(s, cost) && isFinite(t) ? `<div class="kv" style="margin-top:4px"><span>Disponible</span><b>dans ${formatDuration(t)}</b></div>` : ''}`;
      }
      case 'bridge': {
        const z = ZONES[it.zone!];
        const t = timeToAfford(s, r, z.cost);
        return `<h3>${ICONS.bridge} ${z.bridgeName}</h3>
          <p>Mène à l’<b>${z.name}</b>. ${z.blurb}</p>
          <div class="foot">${act('Construire')} <span style="margin-left:auto">${costHtml(z.cost, have)}</span></div>
          ${!canAfford(s, z.cost) && isFinite(t) ? `<div class="kv" style="margin-top:4px"><span>Disponible</span><b>dans ${formatDuration(t)}</b></div>` : ''}`;
      }
      case 'golden':
        return `<h3>${ICONS.lumen} Cristal doré</h3><p>Frappe-le ${this.golden.maxHits} fois avant qu’il ne s’éteigne !</p><div class="kv"><span>Coups</span><b>${this.golden.hits} / ${this.golden.maxHits}</b></div><div class="kv"><span>Temps</span><b>${Math.ceil(this.golden.timeLeft)} s</b></div>`;
      case 'dock':
        return `<h3>${ICONS.airship} Quai des dirigeables</h3><p>Envoie un familier en expédition, de 10 minutes à 8 heures. Il revient avec du butin, même si le jeu est fermé.</p><div class="kv"><span>En voyage</span><b>${s.expeditions.length} / ${EXPEDITION.slots}</b></div><div class="foot">${act('Ouvrir le quai')}</div>`;
      case 'merchant':
        return `<h3>${ICONS.balloon} Marchand ambulant</h3><p>Œufs, fragments et runes garanties, contre du Lumen.</p><div class="kv"><span>Repart dans</span><b>${Math.ceil(this.merchant.timeLeft)} s</b></div><div class="foot">${act('Voir ses merveilles')}</div>`;
      case 'rift':
        return `<h3>${ICONS.rift} Faille d’éther</h3><p>Frappe-la ${this.rift.maxHits} fois pour la refermer : production ×${RIFT.surgeMult} pendant ${RIFT.surgeSeconds} s.</p><div class="kv"><span>Coups</span><b>${this.rift.hits} / ${this.rift.maxHits}</b></div><div class="kv"><span>Temps</span><b>${Math.ceil(this.rift.timeLeft)} s</b></div>`;
      case 'nest':
        return `<h3>${ICONS.egg} Nid d’éther</h3>
          <p>Fais éclore des œufs : tes familiers frappent le cristal pour toi, même quand tu ne joues pas.</p>
          <div class="kv"><span>Œufs</span><b>${s.eggs}</b></div><div class="kv"><span>Familiers</span><b>${s.pets.length}</b></div>
          <div class="foot">${act('Ouvrir le nid')}</div>`;
      case 'crucible':
        return `<h3>${ICONS.cauldron} Creuset runique</h3>
          <p>Jette 5 copies d’une rune et quelques fragments : il en sort une rune de la rareté supérieure.</p>
          <div class="kv"><span>Fragments</span><b>${ICONS.fragment} ${formatNumber(Math.floor(s.fragments))}</b></div>
          ${s.fragments <= 0 ? '<div class="warn">Les fragments tombent des gardiens de cristal.</div>' : ''}
          <div class="foot">${act('Ouvrir le Creuset')}</div>`;
      case 'guardian':
        return `<h3>${ICONS.fragment} Gardien de cristal</h3><p>Brise-le à la pioche avant qu’il ne reparte. Quand il frappe le sol, <b>saute</b> pour éviter l’onde de choc !</p><div class="kv"><span>Points de vie</span><b>${this.guardian.hp} / ${this.guardian.maxHp}</b></div><div class="kv"><span>Temps</span><b>${Math.ceil(this.guardian.timeLeft)} s</b></div>`;
      case 'altar': {
        const f = FAMILIES[it.family!];
        return `<h3>${ICONS.altar} ${f.altarName}</h3>
          <p>${f.blurb} Paie l’autel pour tirer des runes : leurs bonus s’additionnent.</p>
          ${f.nightOnly && !isNight(s) ? `<div class="warn">Endormi. Il s’éveille à la nuit tombée, dans ${formatDuration(secondsToNight(s))}.</div>` : ''}
          <div class="kv"><span>Tirage</span><b>${costHtml(rollCostOf(s, it.family!), have)}</b></div>
          <div class="foot">${act('Ouvrir l’autel')}</div>`;
      }
      case 'lighthouse': {
        const ready = canPrestige(s);
        return `<h3>${ICONS.lighthouse} Phare des étoiles</h3>
          <p>${ready ? `Il est éveillé ! Il peut faire descendre l’île contre <b>${prestigeGain(s)} graines d’étoile</b>.` : `Il dort. Récolte ${formatNumber(islandThreshold(s))} éclats sur cette île pour l’éveiller.`}</p>
          ${ready ? '' : `<div class="ms"><i style="width:${Math.min(100, (s.stats.runShards / islandThreshold(s)) * 100)}%"></i></div>`}
          <div class="foot">${act('Parler au Phare')}</div>`;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // UI wiring, settings, saving
  // ---------------------------------------------------------------------------

  private bindUi(): void {
    this.hud.workshopBtn.addEventListener('click', () => {
      this.audio.click();
      this.panels.toggleWorkshop(this.currentObjective()?.id === 'pick1' ? 'upgrades' : undefined);
    });
    this.hud.menuBtn.addEventListener('click', () => {
      this.audio.click();
      this.panels.show(this.panels.menu);
    });
    this.hud.muteBtn.addEventListener('click', () => this.toggleMute());
    this.hud.journalBtn.addEventListener('click', () => this.togglePanel(this.journal.el, () => this.journal.refresh()));
    this.hud.runesBtn.addEventListener('click', () => this.openRunes(this.lastFamily));
    this.hud.gardenBtn.addEventListener('click', () => this.openGarden(true));
    this.hud.ascBtn.addEventListener('click', () => this.openAscension(true));
    this.hud.petsBtn.addEventListener('click', () => this.togglePanel(this.petPanel.el, () => this.petPanel.refresh()));
    this.hud.prestigeBtn.addEventListener('click', () => {
      this.audio.click();
      this.panels.showPrestige();
    });
    const press = (b: HTMLElement, fn: () => void) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };
    let actHold: number | null = null;
    press(this.hud.actBtn, () => {
      if (!this.started || this.busy) return;
      this.interact(this.near, true);
      if (this.near?.kind === 'crystal') {
        actHold = window.setInterval(() => {
          if (this.near?.kind === 'crystal' && !this.busy) this.doHarvest();
        }, 330);
      }
    });
    const stopHold = () => {
      if (actHold !== null) window.clearInterval(actHold);
      actHold = null;
    };
    this.hud.actBtn.addEventListener('pointerup', stopHold);
    this.hud.actBtn.addEventListener('pointerleave', stopHold);
    this.hud.actBtn.addEventListener('pointercancel', stopHold);
    press(this.hud.jumpBtn, () => {
      this.doJump();
    });
  }

  private toggleMute(): void {
    this.state.settings.muted = !this.state.settings.muted;
    this.applySettings();
    if (!this.state.settings.muted) this.audio.click();
  }

  private applySettings(): void {
    const st = this.state.settings;
    this.audio.setVolumes(st.sfx, st.music, st.muted);
    this.hud.setMuted(st.muted);
    if (this.renderer.quality !== st.quality) this.renderer.setQuality(st.quality);
  }

  private snapshot(): GameState {
    const p = this.world.player;
    this.state.player = { x: p.position.x, z: p.position.z, yaw: this.world.rig.yaw };
    return this.state;
  }

  save(): void {
    if (this.busy) return;
    saveToStorage(this.snapshot());
  }

  private importSave(text: string): string | null {
    try {
      const s = importSave(text);
      saveToStorage(s);
      window.setTimeout(() => location.reload(), 600);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  private hardReset(): void {
    clearStorage();
    this.save = () => {};
    location.reload();
  }
}


/** Visual pickaxe tier = number of pickaxe upgrades owned (0..6). */
export function pickTierOf(s: GameState): number {
  return ['pick1', 'pick2', 'pick3', 'pick4', 'pick5', 'pick6'].filter((id) => s.upgrades[id]).length;
}

function runeEffectText(stat: import('./config/runes').RuneStat, v: number): string {
  return statTextFn(stat, v);
}

function MODEL_H(h: number): number {
  return h + 0.8;
}
