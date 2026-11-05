# CLAUDE.md — Les Îles d’Éther

Jeu incrémental (idle/clicker) **en 3D** dans le navigateur : un explorateur sur une île flottante récolte un cristal à la pioche, construit des machines posées physiquement, relie des îlots par des ponts, tire des runes, puis fait « descendre » l’île (prestige). Tout est en français (code commenté en anglais, textes du jeu en français).

- **Jeu en ligne** : https://francoisq890-dotcom.github.io/Island-idle/ (déployé par GitHub Actions à chaque push sur `main`).
- **Docs à lire avant de toucher au design** : `DECISIONS.md` (choix de design et technique, direction artistique de l’UI, équilibrage chiffré) et `README.md` (contrôles, fonctionnalités, limites).
- Le propriétaire du projet travaille sans relire chaque étape : il veut des **commits + push sur `main` après chaque étape stable**, pour que le jeu en ligne reste toujours jouable. Les décisions vont dans `DECISIONS.md`.

## Commandes

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest (46 tests) : économie, runes, succès, sauvegarde/migration, hors-ligne, clavier, collisions, équilibrage
npm run simulate     # rapport d’équilibrage (bot) ; `-- --verbose` liste chaque achat ; code de sortie ≠ 0 si une cible est ratée
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
  game.ts            ORCHESTRATION : boucle, entrées → actions, économie ↔ monde ↔ UI ↔ audio,
                     tutoriel/objectifs, runes (tirages, célébrations, ralenti), événements, prestige, sauvegarde
  config/            DONNÉES UNIQUEMENT (aucune logique lourde)
    economy.ts       machines, améliorations, zones, paliers, prestige, hors-ligne  ← fichier unique de l’économie
    runes.ts         raretés, familles/autels, 28 runes, améliorations d’autel, règles de tirage, plafonds
    achievements.ts  32 succès (condition + bonus permanent)
    constellations.ts objectif long terme (avantages selon les graines totales)
    events.ts        météores, cristal doré
    world.ts         disposition : îles, chantiers, slots, ponts, Phare, portées d’interaction
    palette.ts       couleurs du monde, saisons après prestige
  economy/           RÈGLES PURES (pas de Three.js ni de DOM) → testables et réutilisées par le bot
    state.ts         GameState + SAVE_VERSION + état initial
    economy.ts       coûts, computeRates(), tick, harvest/harvestEx (critiques), achats, prestige
    bonuses.ts       bonusTotals() = runes + succès, plafonds appliqués, mis en cache
    runes.ts         probabilités avec chance, doRoll, coût croissant, autel, budget d’auto-tirage, rétention
    achievements.ts  checkAchievements()
    objectives.ts    18 objectifs du tutoriel (texte, cible de balise, progression, récompense)
    offline.ts       gains hors-ligne exacts (taux × durée)
    simulation.ts    bot d’équilibrage
    format.ts        1.2K / 3.4M / 1.23e21, durées
  save/save.ts       sérialisation défensive, MIGRATIONS (v1→v2), export/import texte « ILES1.<base64> »
  world/             TOUT LE 3D
    world.ts         possède tous les objets 3D, sync(state), interactables, pick() (rayon vs sphères), nearest(), prestige descend/rise
    renderer.ts      WebGLRenderer, ciel, lumières, ombres, post-process (bloom + étalonnage), résolution adaptative
    terrain.ts       maillage des îles + Ground (hauteur, walkable, overlap, canMove anti-blocage)
    geom.ts          build(parts) : primitives colorées fusionnées ; makeMaterial() avec attribut `emit` par sommet
    player.ts        explorateur + contrôleur + machine à états de la frappe de pioche
    pickaxe.ts       7 modèles de pioche + traînée (ruban)
    machines.ts, conveyors.ts, bridges.ts, altars.ts, landmarks.ts (Nexus, cristal, Phare, panneaux, balise),
    decor.ts, particles.ts, events.ts (météores, cristal doré), cameraRig.ts
  ui/                hud.ts (HUD, nombres flottants, toasts, boussole), panels.ts (Atelier, Carnet, modales hors-ligne/prestige,
                     helpers framePanel/seal/setSeal), runes.ts (Autel + Index + célébration), journal.ts, icons.ts (SVG), style.css
  audio/audio.ts     tout est synthétisé en Web Audio : effets, carillons, fanfares, musique générative, ambiances par île
  core/              input.ts (clavier par actions, souris, joystick tactile, pincement), tween.ts, noise.ts, events.ts
tests/               *.test.ts (Vitest)
scripts/             simulate.ts, e2e-movement.mjs, shot.mjs
docs/                captures utilisées par le README
```

Flux de données : `GameState` (mutable, sauvegardé) → `computeRates(state)` (dérivé, mis en cache dans `Game.rates`, recalculé par `markDirty()` après chaque changement) → `World.sync(state, rates, animate)` pour la 3D, et lecture directe par l’UI à chaque frame (avec mise à jour en place, sans re-render complet).

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

**Ressources** : éclats (base) ; Lumen (raffineries : 10 éclats → 1 Lumen, **jamais plus de 50 %** de la production prélevée ; les prismes en produisent aussi) ; graines d’étoile (prestige, +5 % de production chacune).

**Règles principales** (toutes dans `config/`) :
- **Machines** : coût `base × 1.15^n` (× réduction des runes), paliers ×2 à 25/50/100/150/200/300/400/500.
- **Améliorations** : 26 dans `UPGRADES` (dont 6 pioches et 4 synergies `type: 'synergy'`) ; 3 zones à ouvrir dans l’ordre après l’Île Mère.
- **Prestige** au Phare (Île Céleste requise). Seuil `prestigeThreshold(p) = 8e9 × 8^p`. Gain `floor(√(runShards / (3e7 × 8^(p/2))))`, × (1 + bonus de graines des runes). Il garde les graines, les runes légendaires et plus, les succès, l’auto-tirage et les statistiques. Les Constellations (graines totales) donnent des avantages de départ (`config/constellations.ts`, appliqués à la fin de `doPrestige`).
- **Runes** : chance de base « 1 sur N ». La chance L devient « L sur N », répartie de la rareté la plus haute vers la plus basse (`rarityChances`). Bonus d’une rune = valeur × copies^0,6. Plafonds dans `STAT_CAP` (coûts −60 %, critique 50 %, vitesse +150 %, hors-ligne +200 %, graines +100 %). Chaque tirage d’une famille coûte ×1,018 de plus (remis à zéro au prestige). **L’auto-tirage n’utilise jamais plus de 10 % du revenu** (`AUTO_SHARE`, `autoRollAllowed`).
- **Événements** : récompenses exprimées en secondes de production.
- **Hors-ligne** : exact, plafonné à 8 h, × bonus des runes.

**Méthode d’équilibrage** : modifier les chiffres dans `config/`, puis `npm run simulate`. Le bot (`economy/simulation.ts`) :
- frappe à cadence fixe ;
- achète l’option au meilleur « temps d’attente + temps de retour » ;
- tire des runes par espérance de gain (copies fractionnaires) ;
- achète les améliorations d’autel avec des règles simples ;
- ramasse 75 % des événements ;
- débloque les succès.

Cibles vérifiées par le script et par `tests/balance.test.ts` :

| Cible | Seuil | Mesuré (dernier passage) |
|---|---|---|
| Blocage en début de partie | ≤ ~2 min | 35–46 s |
| 1er prestige, profils moyen et paresseux | 30–45 min | 36 et 40 min |
| 1er prestige, profil optimal | ≥ 24 min | 26 min |
| Accélération due aux runes | ×1,08 à ×1,8 | ×1,6 (59 min sans runes) |
| 2e île | < 70 % de la 1re | ≈ 8 min |

Ce qui a déjà cassé l’équilibre (à surveiller), d’après DECISIONS.md § 6 :
- des récompenses d’événements trop fortes ;
- des améliorations d’autel trop bon marché en fin de partie (Charge, Chance) ;
- garder les runes épiques au prestige ;
- une règle d’auto-tirage basée sur la réserve au lieu du revenu ;
- les pourcentages de production par coup des pioches, qui creusent l’écart entre profils.

L’écart actif/passif est structurel. L’attente la plus longue en milieu de partie (~4–5 min vers 11–15 min) est comblée par les tirages de runes, qui ne comptent pas comme achats dans la métrique.

## État actuel

Deux itérations livrées et déployées :
1. **Tranche verticale + contenu de base** : 4 îles, 5 machines, convoyeurs, ponts, prestige, hors-ligne, tutoriel.
2. **Itération 2** :
   - correctif du déplacement + e2e ;
   - vraie frappe de pioche + 7 modèles ;
   - refonte complète de l’UI ;
   - runes (4 autels, 28 runes, 7 raretés) ;
   - météores, cristal doré, critiques, 32 succès, synergies, Constellations, combos cosmétiques ;
   - ambiances sonores par île ;
   - rééquilibrage complet ;
   - sauvegarde v2 avec migration.

Format de sauvegarde actuel : **v2** (clé `localStorage` `iles-ether.save`). La migration v1→v2 décale l’index d’objectif (insertion de l’objectif `rune1` à l’index 6) et pose `flags.migratedV2` (annonce unique « Nouveau : les autels des runes »).

## Bugs et limites connus

- **Bug signalé « seule Z fonctionne »** : jamais reproduit à l’identique dans Chromium. Trois causes réelles ont été corrigées (codes de touches dépendant de la disposition ou vides, joueur emprisonné dans une machine, focus capturé par un contrôle de formulaire). Si le propriétaire le signale à nouveau : demander navigateur et version, et tester Firefox avec `privacy.resistFingerprinting`. Seul Chromium est disponible dans l’environnement cloud.
- **60 fps non mesurés sur un vrai GPU** (headless = rendu logiciel). Partie avancée : ~150 appels de dessin toutes passes comprises, ~250K triangles. La résolution adaptative (`renderer.ts`) et le mode « Économie » compensent.
- **Le site en ligne n’est pas accessible depuis l’environnement cloud** (proxy : `github.io` refusé). On ne peut vérifier le déploiement que par le statut des jobs GitHub Actions.
- `rarityChances` peut ramener la rareté commune à 0 % quand la chance est élevée : c’est voulu, mais les runes communes deviennent alors introuvables pendant cette île.
- Au-delà des emplacements d’un chantier (5 à 12), les machines supplémentaires ne s’affichent pas ; les existantes grandissent et changent de teinte aux paliers.
- Code mort : `src/core/events.ts` (`Emitter`) n’est utilisé nulle part.
- `GoldenCrystal.update` recrée la géométrie de l’anneau de minuterie (bridé à 1 % de variation) : acceptable, mais un shader serait plus propre.
- Les célébrations (rayons SVG plein écran, particules) sont lourdes en rendu logiciel. Sur machine réelle c’est fine, mais tester le mode « Économie » sur un portable faible serait utile.
- Pas de remappage des touches, pas d’autre langue que le français.

## Idées pour la suite

- **Contenu** : une 5e île et une 6e machine (avec leur famille de runes) ; un vrai arbre de talents payé en graines ; des quêtes ou défis temporaires (« île sans foreuses ») ; des ensembles de runes (bonus si une famille est complète) ; une forge pour fusionner des doublons en rareté supérieure (puits pour les communes en excès).
- **Game feel** : caméra qui recule doucement quand l’île se remplit ; vue d’ensemble (touche V) ; meilleurs indicateurs d’événements hors champ (la boussole ne pointe que vers la cible d’objectif et le cristal doré) ; météores qui laissent des cratères temporaires.
- **Équilibrage** : réduire l’écart entre profils actif et passif (moins de valeur par clic en fin d’île, plus d’automatisation) ; rendre le profil optimal ≥ 30 min ; simuler 3 à 5 prestiges d’affilée et viser une courbe de durée par île.
- **Technique** : bornes de performance automatiques (compteur d’appels de dessin dans un test Playwright) ; supprimer `core/events.ts` ou s’en servir pour découpler `game.ts` (1 100+ lignes, candidat à un découpage : runes, événements et prestige dans des contrôleurs séparés) ; i18n si nécessaire.
