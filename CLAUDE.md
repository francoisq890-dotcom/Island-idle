# CLAUDE.md — Les Îles d’Éther

Jeu incrémental (idle/clicker) **en 3D** dans le navigateur : un explorateur sur une île flottante récolte un cristal à la pioche, construit des machines posées physiquement, relie des îlots par des ponts, tire et fusionne des runes, combat des gardiens de cristal, élève des familiers, fait « descendre » l’île (prestige) puis élève tout l’archipel au-dessus des nuages (Ascension). Tout est en français (code commenté en anglais, textes du jeu en français).

- **Jeu en ligne** : https://francoisq890-dotcom.github.io/Island-idle/ (déployé par GitHub Actions à chaque push sur `main`).
- **Docs à lire avant de toucher au design** : `DESIGN.md` (frise de progression, systèmes, ce qui est exclu), `BALANCE.md` (passe d’équilibrage globale, cibles, plafonds), `DECISIONS.md` (choix de design et technique, direction artistique de l’UI) et `README.md` (contrôles, fonctionnalités, limites).
- Le propriétaire du projet travaille sans relire chaque étape : il veut des **commits + push sur `main` après chaque étape stable**, pour que le jeu en ligne reste toujours jouable. Les décisions vont dans `DECISIONS.md`.

## Commandes

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest (98 tests, ≈ 1 min) : économie, runes, fusion, succès, familiers, talents, expéditions, Ascension, sauvegarde/migrations, hors-ligne, clavier, équilibrage (5 profils × cycle complet)
npm run simulate     # campagne du bot jusqu’à l’Ascension, 5 profils (≈ 50 s) ; `-- --verbose` détaille chaque île ; code ≠ 0 si une cible est ratée
npx tsx scripts/make-save.ts 25 2   # sauvegarde de test : 25 min de jeu après 2 descentes (pour les captures)
npm run test:e2e     # Playwright : 41 cas de déplacement (lance son propre serveur Vite sur :5199)
npm run build        # tsc --noEmit + vite build → dist/
npx tsc --noEmit     # typecheck seul (TypeScript 7, `noUnusedLocals` actif : les imports inutilisés cassent le build)
```

La CI (`.github/workflows/deploy.yml`) lance dans l’ordre : `npm test`, `npm run simulate`, `npx playwright install chromium`, `npm run test:e2e`, `npm run build`, puis publie sur Pages. **Si la simulation sort des cibles, le déploiement est bloqué** (c’est voulu). Les pushs rapprochés s’annulent entre eux (`cancel-in-progress`) : seul le dernier compte.

### Captures d’écran (vérification visuelle)

`scripts/shot.mjs` pilote Chromium headless (WebGL logiciel SwiftShader) :

```bash
# scénario de base (titre, départ, marche, récolte)
node scripts/shot.mjs <dossierSortie> basic
# scénario scripté : STEPS = JSON [{js|key|wait|shot|log}], SAVE = sauvegarde injectée, MOBILE=1, AWAY=secondes d’absence
SAVE="$(cat save.json)" STEPS='[{"wait":5000,"shot":"a"}]' node scripts/shot.mjs <dossier> eval
```

Pièges connus du headless :
- Le rendu tourne à **1–2 fps** en 1280×720. Les cinématiques prennent donc 10 à 50 s réelles (le `dt` est plafonné à 0,1 s).
- Commencer les scénarios par `{"js":"window.game.renderer.setQuality('low')"}`, sinon les moments chargés en particules dépassent le délai de 30 s de `page.screenshot`.
- `window.game` expose l’instance `Game`. Les champs `private` TypeScript restent accessibles en JS : `game.state`, `game.world`, `game.rollRunes(f, true)`, `game.startMeteorShower()`, `game.spawnGolden()`, `game.frame(dt)`, `game.panels`, `game.journal`…
- Le bouton « Jouer » pulse : cliquer avec `{ force: true }`, ou appeler `game.start()`.
- La sauvegarde est injectée par `addInitScript` (et non via `localStorage` + reload, car le jeu sauvegarde au `beforeunload` et écraserait l’injection).

## Stack

Vite 8 + TypeScript 7 + Three.js r187, sans framework UI (DOM + CSS). Polices via fontsource (Fraunces variable, Alegreya Sans, donc incluses dans le build). Vitest 5, tsx (simulation), Playwright 1.63 (dev dependency ; la version correspond au Chromium préinstallé dans l’environnement cloud). Aucun asset externe : modèles, sons et musique sont tous générés en code.

## Architecture

```
src/
  main.ts            boot, écran titre, expose window.game
  game.ts            ORCHESTRATION (≈ 2 000 lignes) : boucle, entrées → actions, économie ↔ monde ↔ UI ↔ audio,
                     tutoriel, runes, gardiens, familiers, expéditions, événements, prestige, Ascension, game feel
  config/            DONNÉES UNIQUEMENT
    economy.ts       machines, améliorations, zones, paliers, prestige (seuils), hors-ligne
    runes.ts         raretés, 6 familles (Lune la nuit, Gardien sans autel), 42 runes, sets, fusion, pitié, plafonds (STAT_CAP, RUNE_CAP, SOFT_CAP)
    achievements.ts  62 succès à paliers (bronze/argent/or), 6 catégories
    daynight.ts, guardians.ts, familiars.ts, talents.ts, expeditions.ts (+ faille, marchand), ascension.ts (reliques, défis)
    constellations.ts, events.ts, world.ts, palette.ts
  economy/           RÈGLES PURES (pas de Three.js ni de DOM) → testables et réutilisées par le bot
    state.ts         GameState + SAVE_VERSION (4) + état initial
    economy.ts       coûts, computeRates(), tick, harvestEx, achats, prestige (resetIsland), défis, Ascension
    bonuses.ts       bonusTotals() = runes + succès + talents + Ascension, plafonds et plafonds doux, en cache
    runes.ts         chance, tirages + pitié, fusion, sets, spéciaux mythiques, butin des gardiens, plafonds par îles reliées
    daynight.ts, guardians.ts, familiars.ts, talents.ts, expeditions.ts, events2.ts (faille, marchand), ascension.ts
    achievements.ts, objectives.ts (20 étapes), offline.ts, format.ts
    simulation.ts    bot (profils, chanceux, acheteur au hasard) ; campaign.ts (cycle complet) ; balanceTargets.ts (cibles = tests)
  save/save.ts       sérialisation défensive, MIGRATIONS v1→v2→v3→v4, export/import « ILES1.<base64> »
  world/             TOUT LE 3D
    world.ts         possède les objets 3D, sync(state), interactables, pick(), nearest(), descend/rise/ascendUp
    renderer.ts      ciel jour/nuit (étoiles, lune, aurores), lumières, ombres, post-process (GTAO, bloom, rayons, étalonnage), presets de qualité
    geom.ts          build(parts), makeMaterial() (emit par sommet, vent, scintillement), uniformes globaux GLOBAL_EMIT/TIME/WIND
    player.ts        explorateur, frappe de pioche, écrasement/étirement, célébration
    guardian.ts, familiars.ts (nid + créatures), crucible.ts (Creuset), dock.ts (quai, dirigeables, faille, montgolfière)
    machines.ts, conveyors.ts, bridges.ts, altars.ts, landmarks.ts (Nexus, cristal, Phare + jardin), decor.ts, particles.ts, events.ts, cameraRig.ts (secousse, punch)
  ui/                hud.ts (HUD, cadran jour/nuit, barre de gardien, compteur de série, gains volants), panels.ts, runes.ts (Autel, Creuset, Index & sets),
                     journal.ts (succès, statistiques, constellations), familiars.ts, talents.ts, expeditions.ts (quai + marchand), ascension.ts, icons.ts, style.css
  audio/audio.ts     synthèse Web Audio : effets (variations de hauteur), musique adaptative par couches, ambiances jour/nuit par île
  core/              input.ts, tween.ts, noise.ts, events.ts
tests/               *.test.ts (Vitest)
scripts/             simulate.ts, make-save.ts, e2e-movement.mjs, shot.mjs
docs/                captures du README
```

Flux de données : `GameState` (mutable, sauvegardé) → `computeRates(state)` (dérivé, mis en cache dans `Game.rates`, recalculé par `markDirty()`) → `World.sync(state, rates, animate)` pour la 3D, et lecture directe par l’UI à chaque frame.

## Conventions de code

- **L’économie reste pure.** Toute règle de jeu chiffrée va dans `src/config/*` (données) et `src/economy/*` (fonctions pures sur `GameState`). Jamais de Three.js ni de DOM dans `economy/`. Le bot et les tests importent ces modules directement.
- **Après toute modification de `GameState` hors de `tick`, appeler `game.markDirty()`.** Il recalcule les taux et répercute `strikeSpeed` sur le joueur. Puis `afterProgress()` (succès) si c’est un progrès.
- **Nouveau champ de sauvegarde** :
  1. l’ajouter à `GameState` et à `createInitialState` ;
  2. le relire de façon défensive dans `deserialize` (`num()`, `obj()`, valeur par défaut) ;
  3. si le format change de sens, incrémenter `SAVE_VERSION` et ajouter une entrée dans `MIGRATIONS` ;
  4. ajouter un test dans `tests/save.test.ts` ou `tests/runes.test.ts`.

  Les sauvegardes des joueurs doivent **toujours** se charger.
- **3D** :
  - Pour tout objet répété, utiliser `InstancedMesh` + `build()` (géométries fusionnées avec couleurs et `emit` par sommet) + un `makeMaterial()` partagé. Éviter les matériaux par objet.
  - Les parties lumineuses passent par `emit` (masque émissif) pour que seul le bloom les touche.
  - Ne pas allouer d’objets Three.js par frame (réutiliser des `Object3D`/`Vector3` en champs).
- **UI** :
  - Panneaux construits une fois, mis à jour en place. Le contenu n’est reconstruit que si la « signature » change (sinon les clics sont perdus pendant un re-render).
  - Boutons d’achat : `seal()` / `setSeal()`. `setSeal` réécrit la classe mais conserve `data-base`, ne pas contourner.
  - Nouveau panneau : `framePanel(...)` + `panels.register(el)`.
- **Entrées** : le clavier passe par des **actions** (`actionOf`, `moveVector` dans `core/input.ts`), pas par des `e.code` en dur. La référence est le code physique (ZQSD AZERTY = WASD QWERTY), avec repli sur `e.key`. Ne jamais revenir à `e.code === 'KeyW'` seul.
- **Textes joueur en français**, nombres via `formatNumber`/`formatRate`, durées via `formatDuration`. Icônes : SVG de `ui/icons.ts` uniquement, **jamais d’emoji**.
- **Commits** : messages en anglais, descriptifs ; push direct sur `main` (branche de développement unique désormais).

## Direction artistique

**Monde** (à ne pas casser, le propriétaire l’aime) : low-poly flat-shaded, coucher de soleil chaud (ciel lavande → pêche), mer de nuages, palette restreinte dans `config/palette.ts`. Code couleur constant : **cyan = éclats bruts**, **or = Lumen**, **violet = graines/prestige**. Chaque îlot a sa teinte : Forges ocre et volcaniques, Geysers turquoise, Île Céleste lavande. Après chaque prestige, l’Île Mère repousse dans une autre saison (`HOME_SEASONS`).

**Interface : « le Carnet du Cartographe »** (détails dans DECISIONS.md § 3). Le propriétaire a explicitement rejeté le look « UI générée par IA » : cartes sombres semi-transparentes, dégradés, emojis, grilles de cartes identiques, trop de texte.
- **Matériaux** : vélin crème opaque (`--vellum #f3e6cc`) avec grain SVG ; cadres en laiton en neuf-quartiers SVG (`border-image: var(--frame)`) ; encre prune (`--ink #2a2035`) ; ombres franches décalées.
- **Typo** : `--display` (Fraunces, axes SOFT/WONK) pour titres et nombres ; `--text` (Alegreya Sans) pour le corps.
- **Encres de ressource sur papier** : `--ether #138aa6`, `--gold #a86b0c`, `--violet #6f45b8`.
- **Hiérarchie** : une ligne de registre = une décision (médaillon, nom + nombre possédé, **gain en grand dans la couleur de la ressource**, détails petits à l’encre pâle, prix sur le sceau de laiton à droite).
- **Mouvement et son** : les panneaux se déplient (rotateX + scale, léger dépassement), les lignes arrivent en cascade, le sceau brille au survol, s’enfonce et « tamponne » à l’achat. Sons d’UI dans `audio.ui()`.
- **Vérifier en captures, desktop ET mobile (390×844), avant de considérer un écran fini.** Points de rupture CSS : 760 px de large, 520 px de haut.

## Économie et équilibrage

**Ressources** : éclats (base) ; Lumen (raffineries, jamais plus de 50 % de la production prélevée ; prismes) ; graines d’étoile (prestige) ; **fragments de rune** (gardiens, expéditions, marchand : monnaie de la fusion) ; **couronnes d’éther** (Ascension).

**Règles principales** (toutes dans `config/`) :
- **Machines** : `base × 1.15^n`, paliers ×2 à 25/50/100/…
- **Prestige** : seuil `1,8e10` pour la 1re île, ×20 pour la 2e, puis ×2,9 par île (`prestigeThreshold(islandIndex)`, remis à zéro à chaque Ascension). Gain = ⌊√(éclats / (1,4e8 × √(seuil/seuil₀)))⌋. Graines : +5 % chacune jusqu’à 100, puis `100 × (g/100)^0,8` (`effectiveSeeds`).
- **Runes** : bonus = valeur × copies^0,6. Trois niveaux de plafonds :
  - `RUNE_CAP`, ce que les runes seules peuvent donner, multiplié par 10/25/55/100 % selon les îles reliées ;
  - `STAT_CAP`, les plafonds durs ;
  - `SOFT_CAP`, où au-delà de k le bonus ne croît plus qu’en k·(x/k)^0,4.

  Chance des graines : ×(1 + 0,5·log₂(1 + g/25)). Nuit : chance ×1,5. Pitié : épique à 100 tirages, légendaire à 1 000.
- **Familiers** : frappent pour 25 à 100 % d’un coup toutes les 1,6 à 2 s (+6 %/niveau, niveau 25 au plus, 3 perchoirs). Leur revenu est ajouté *après* le calcul de la valeur d’un coup (pas de boucle).
- **Talents** : les graines plantées comptent toujours pour la production ; réinitialisation gratuite pendant les 3 premières minutes d’une île.
- **Ascension** : 1 000 graines gagnées dans le cycle ; couronnes = ⌊3·√(graines/1 000)⌋, +10 % de production et de chance chacune ; reliques (mécaniques) et défis (récompenses permanentes).
- **Hors-ligne** : exact, plafond 8 h (+2 h par niveau de Rêveur). Les buffs temporaires (Afflux) ne comptent jamais hors-ligne. Les expéditions sont en temps réel.

**Méthode d’équilibrage** : voir **BALANCE.md**. En bref :
- modifier `config/`, puis `npm run simulate` ;
- cinq profils (optimal, moyen, idle, chanceux `u^1,5`, acheteur au hasard) jouent un cycle complet jusqu’à l’Ascension ;
- les cibles sont dans `economy/balanceTargets.ts` et sont aussi des tests :
  - 1er prestige jamais avant 25 min, et 30–45 min pour le moyen et l’idle ;
  - Ascension jamais avant 2 h, et ≤ 6 h pour le moyen et l’idle ;
  - chaque île ≥ 3 min ;
  - blocage (rien d’achetable) ≤ 130 s ;
  - bonus de production ≤ +1 200 % ;
  - saut du multiplicateur de prestige ≤ ×6,5 d’une île à l’autre.

Pour trouver un emballement : lancer un profil avec `noRunes`/`noPets`/`lucky`, et comparer `bonusTotals` à 4 min et à 10 min (voir BALANCE.md § 3).

## État actuel

Trois itérations livrées et déployées :
1. **Tranche verticale** : 4 îles, 5 machines, convoyeurs, ponts, prestige, hors-ligne, tutoriel.
2. **Itération 2** : déplacement + e2e, frappe de pioche, UI « Carnet du Cartographe », runes, événements, succès, Constellations.
3. **Itération 3** (DESIGN.md) :
   - 62 succès à paliers et des statistiques ;
   - cycle jour/nuit ;
   - runes v2 (Lune, Gardien, fusion, sets, pitié, mythiques à effet) et gardiens de cristal ;
   - familiers, Jardin d’étoiles (talents, Contremaître), expéditions, faille d’éther, marchand ;
   - Ascension avec reliques et défis ;
   - passe d’équilibrage globale ;
   - polish (presets de qualité, rayons, GTAO, vent, scintillement, écrasement/étirement, compteur de série, gains volants, punch caméra, vibrations, musique adaptative).

Format de sauvegarde : **v4** (clé `iles-ether.save`).
- **v3** : succès en paliers (id → palier), index des runes.
- **v4** : étape « premier familier » insérée à l’index 13 du tutoriel ; les joueurs déjà au-delà reçoivent l’œuf offert.

Les champs ajoutés ensuite (talents, expéditions, Ascension) sont relus de façon défensive, sans changement de version.

## Bugs et limites connus

- **Bug signalé « seule Z fonctionne »** : jamais reproduit à l’identique dans Chromium. Trois causes réelles ont été corrigées (codes de touches dépendant de la disposition ou vides, joueur emprisonné dans une machine, focus capturé par un contrôle de formulaire). Si le propriétaire le signale à nouveau : demander navigateur et version, et tester Firefox avec `privacy.resistFingerprinting`. Seul Chromium est disponible dans l’environnement cloud.
- **60 fps non mesurés sur un vrai GPU** (headless = rendu logiciel). Partie avancée en « Haute » : ~320 appels de dessin toutes passes comprises, ~440K triangles ; en « Ultra » (GTAO) ~630 appels. L’Automatique baisse la résolution puis descend d’un preset si les frames restent lentes.
- En headless, la cinématique d’ouverture dure souvent plus de 15 s réelles : dans les scénarios de capture, forcer `g.world.rig.cinematic=null; g.hud.show(true)`.
- **Le site en ligne n’est pas accessible depuis l’environnement cloud** (proxy : `github.io` refusé). On ne peut vérifier le déploiement que par le statut des jobs GitHub Actions.
- `rarityChances` peut ramener la rareté commune à 0 % quand la chance est élevée : c’est voulu, mais les runes communes deviennent alors introuvables pendant cette île.
- Au-delà des emplacements d’un chantier (5 à 12), les machines supplémentaires ne s’affichent pas ; les existantes grandissent et changent de teinte aux paliers.
- Code mort : `src/core/events.ts` (`Emitter`) n’est utilisé nulle part.
- `GoldenCrystal.update` recrée la géométrie de l’anneau de minuterie (bridé à 1 % de variation) : acceptable, mais un shader serait plus propre.
- Les célébrations (rayons SVG plein écran, particules) sont lourdes en rendu logiciel. Sur machine réelle c’est fine, mais tester le mode « Économie » sur un portable faible serait utile.
- Pas de remappage des touches, pas d’autre langue que le français.

## Idées pour la suite

- **Découpage de `game.ts`** (≈ 2 000 lignes) en contrôleurs : runes, gardiens, familiers/expéditions, événements, Ascension. Le bus `core/events.ts` pourrait servir à les découpler.
- **Contenu** : une 5e île et une 6e machine ; défis supplémentaires (la liste est extensible dans `config/ascension.ts`) ; plus de mythiques à effet.
- **Game feel** : vue d’ensemble (touche V), cratères de météores, chaleur visible au-dessus des raffineries (distorsion d’écran), « course » plus marquée (poussière dense, inclinaison).
- **Équilibrage** : rapprocher le profil optimal (2,4 h jusqu’à l’Ascension) et le moyen (5,5 h) ; courbe des îles 6 à 9 un peu plus douce pour l’idle.
- **Technique** : bornes de performance automatiques (compteur d’appels de dessin dans un test Playwright) ; i18n si nécessaire.
