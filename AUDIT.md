# AUDIT — Les Îles d’Éther (après l’itération 3)

Audit externe et volontairement critique. J’ai lu CLAUDE.md, DESIGN.md, BALANCE.md, DECISIONS.md et le README, relu le code (économie, sauvegarde, hors-ligne, colle `game.ts`, UI), relancé `npm test` (98/98) et `npm run simulate -- --verbose` (toutes les cibles vertes), fait des captures mobiles (390×844) sur une sauvegarde à 2 descentes + 25 min, et vérifié les bugs suspects dans un vrai Chromium (Playwright).

**Gravité.**
- **Critique** : perte de progression ou fonctionnalité totalement cassée. Corrigé dans ce passage, avec un test.
- **Important** : faux, exploitable ou nuisible au plaisir de jeu, sans perte de données.
- **Mineur** : finition, cohérence, dette.

Les références `fichier:ligne` sont celles d’avant correction.

---

## 1. Critiques (corrigés)

| # | Problème | Preuve | Correction | Test |
|---|---|---|---|---|
| C1 | **L’import de sauvegarde ne marchait jamais.** `Game.importSave` écrivait la sauvegarde importée puis rechargeait la page. Le rechargement déclenche `visibilitychange` et `beforeunload`, qui appelaient `save()` avec l’**ancien** état et écrasaient l’import. Le joueur voyait « Sauvegarde chargée ! » et retrouvait sa partie d’avant. | Playwright : import d’une sauvegarde à 777 graines → 0 graine après rechargement. | `writeImportedSave()` (save.ts) écrit puis **verrouille** le stockage pour la page en cours. Après correction : 777 graines. | `tests/storage.test.ts` (C1) |
| C2 | **Une sauvegarde illisible était détruite.** `loadFromStorage` renvoyait `null` sur toute erreur : JSON tronqué, version plus récente (retour arrière d’un déploiement), exception dans une migration. Le jeu démarrait alors une partie neuve, qui écrasait la vraie sauvegarde au premier autosave (10 s). C’est contraire à la règle « les sauvegardes doivent toujours se charger » : on ne peut même plus corriger le bug après coup. | Lecture du code (`save.ts`, `game.ts:121`). | La sauvegarde illisible est copiée dans `iles-ether.save.backup` **avant** toute écriture. Un toast l’annonce, et un bouton « Sauvegarde de secours » du Carnet de bord la remet dans la zone d’import. L’import accepte maintenant le JSON brut sans retirer ses espaces. Si la copie est impossible (stockage plein), la page ne réécrit jamais la sauvegarde. | `tests/storage.test.ts` (C2) |
| C3 | **Deux onglets s’écrasaient mutuellement.** C’est un geste courant dans un idle : ouvrir le jeu une seconde fois. L’ancien onglet, resté en arrière-plan avec un état périmé, réécrivait sa partie à chaque retour et à sa fermeture, ce qui effaçait silencieusement la progression faite dans le nouvel onglet. | Playwright, deux onglets : l’onglet A écrasait les 5 000 éclats de B par 1 éclat en se fermant. | Chaque page « réclame » la sauvegarde avec un identifiant de session (`iles-ether.owner`). Une page dont la réclamation a été reprise par un autre onglet cesse d’écrire et se fige derrière un écran « Partie ouverte ailleurs » (bouton « Reprendre ici » = recharger). La détection passe par l’événement `storage` et est revérifiée à chaque sauvegarde. | `tests/storage.test.ts` (C3) + vérif Playwright |

---

## 2. Bugs et cas limites

### Importants
- **B1. L’économie dépend du nombre d’images par seconde.** `run()` plafonne `dt` à 0,1 s, et `tick(state, dt)` est appelé avec ce `dt` (`game.ts:436`). Sous 10 fps (téléphone faible, rendu logiciel, fenêtre masquée sans `visibilitychange` sur certains systèmes), le jeu produit **moins qu’en temps réel**. Le ralenti des tirages légendaires (`timeScale`) ralentit aussi la production. À faire : une horloge économique en temps réel (accumulateur sur `performance.now()`), séparée du `dt` visuel.
- **B2. Le butin d’expédition passe d’une île à l’autre.** Le butin est figé **en absolu** au départ (`previewLoot`), puis crédité dans `runShards` de l’île où on le réclame.
  - Mesure, profil moyen, fin de l’île 5 : deux odyssées lancées juste avant la descente rapportent **2,4 fois le seuil entier de l’île suivante**. Le Phare de la nouvelle île s’éveille au retour des dirigeables, et les graines (en √) gonflent.
  - Des joueurs le feront sans le vouloir, en lançant une odyssée avant de dormir puis en descendant le matin.
  - Piste : un butin exprimé en *secondes de production* évaluées au retour, ou plafonné à une fraction du seuil de l’île en cours.
- **B3. « Max » et « ×10 » dans l’Atelier affichent un prix et un nombre faux.** `maxAffordable` (`ui/panels.ts:60`) utilise `machineCost`, sans la réduction des runes (jusqu’à −40 %) ni le ×3 du défi *Vie chère*. Le nombre est sous-estimé en temps normal et surestimé pendant le défi. L’achat lui-même est juste (`machineCostFor`) : seul l’affichage ment.
- **B4. Le hors-ligne n’est pas « exact » comme documenté.**
  - Il manque le Contremaître (aucun achat automatique hors-ligne) et les fragments des dragonnets.
  - À l’inverse, le tirage automatique n’est pas prélevé (jusqu’à 10 % de la production en ligne).
  - Les écarts sont faibles, mais DECISIONS.md et le rapport « Bon retour » promettent l’exactitude.

### Mineurs
- **B5.** Revenir sur l’onglet appelle `applyOffline`, qui remet `surge.until` à 0 même après 2 s d’absence : un aller-retour d’onglet **annule l’Afflux ×3** de la faille.
- **B6.** `save()` est ignoré pendant les cinématiques (`busy`). Fermer l’onglet entre `doPrestige` et la fin de la remontée (≈ 4 s) annule la descente : on revient sur l’ancienne île. Rien n’est perdu, mais c’est surprenant.
- **B7. Très grands nombres.** Aucun débordement possible en pratique : les seuils sont remis à zéro à chaque Ascension (≈ 1e16 au plus par cycle), et `formatNumber` passe en notation `1.23e21` au-delà de Qi. Il n’y a en revanche **aucun garde-fou NaN/Infinity** : `JSON.stringify` les écrit `null`, et `num()` les remplace silencieusement par 0 au chargement. Un `NaN` introduit par un futur bug remettrait les éclats à zéro sans bruit.
- **B8.** Les expéditions suivent `Date.now()` : avancer l’horloge système les termine immédiatement. C’est classique et acceptable, mais pas documenté.
- **B9.** `deserialize` ne dédoublonne pas les identifiants de familiers. Une sauvegarde éditée à la main pourrait rattacher une expédition au mauvais familier.
- **B10.** Le round-trip complet d’un état de fin de cycle (après Ascension, 12 familiers, expéditions, reliques) est **exact** (vérifié par script). Aucun test ne le garantit pourtant : seul un état minimal est testé (`save.test.ts`).

---

## 3. Équilibrage (simulation relancée)

Résultats identiques à BALANCE.md (déterministes) : 1er prestige 26 à 42 min (70 min pour « ne lit rien »), Ascension 2,4 à 5,6 h, blocage maximal 17 s. Les cibles passent toutes. Ce qu’elles ne mesurent pas :

### Importants
- **E1. Les bonus plafonnent dès la première île, et la fin de cycle n’a plus de progression de bonus.**
  - Bonus de production (profil moyen) : **+382 % à la fin de l’île 1**, puis **+540 %** à la fin de la 9e. Huit îles de runes, succès, talents et familiers ne rajoutent donc que ×1,33.
  - La **chance plafonne à +421 %** dès l’île 5 à 7, **pour les cinq profils**. Les runes de chance, la nuit, l’Autel de Lune, l’Oracle et la chance des couronnes deviennent alors **sans effet**.
  - La chasse aux runes est le système central de la 1re île et un système mort en fin de cycle. Les plafonds ont réglé les emballements, mais trop tôt.
- **E2. La courbe des îles est en U, avec un mur juste avant l’Ascension.** Profil moyen : 37 → 18 → 10 → **7** → 14 → 25 → **46** → 32 → **74 min**.
  - La dernière île est la plus longue après la première, et il reste des dents de scie (46 puis 32 min).
  - Le joueur ressent un ralentissement au moment où il devrait sentir l’Ascension approcher.
- **E3. L’idle arrive à l’Ascension plus vite que le moyen** (4,7 h contre 5,5 h, en 8 îles contre 9). Le profil idle prolonge chaque île après l’éveil du Phare (`campaign.ts`). Hypothèse à vérifier : **attendre sur une île rapporte plus que descendre**, à cause des graines en √ des éclats et d’un seuil ×2,9 par île. C’est l’inverse de ce qu’un prestige doit encourager.
- **E4. Les familiers saturent tôt.** Sur la sauvegarde « 2 descentes + 25 min » :
  - les familiers sont au **niveau 25, le maximum** ;
  - un œuf coûte 7,2K Lumen pour 12,5M Lumen/s.

  Le Nid n’offre plus aucune décision à partir de la 2e ou 3e île, alors que les familiers sont la « récompense de mi-partie ».
- **E5. Les cibles ignorent le hors-ligne.** Huit heures d’absence (100 % d’efficacité) valent **plusieurs seuils d’île** dès la 2e île. Pour un vrai joueur idle qui ferme le jeu la nuit, le cycle jusqu’à l’Ascension est donc bien plus court que les 4,7 h simulées. La cible « jamais avant 2 h » n’est garantie qu’en jeu continu.
- **E6. Les défis et les reliques ne sont ni simulés ni testés en campagne.** La campagne s’arrête à l’Ascension.
  - *Disette* (production ÷10) se joue au seuil **normal** de l’île en cours. Après une Ascension tardive, cela peut prendre des heures, sans aucune cible.
  - DESIGN.md promettait un « Phare à seuil réduit » (voir K4).

### Mineurs
- **E7.** À haute chance, les raretés commune et peu commune tombent à 0 % (« inconnue » dans l’autel) : l’Index ne peut plus être complété pendant l’île. C’est connu, mais frustrant pour un collectionneur.
- **E8.** La pitié (« épique dans 100 ») reste affichée quand la chance donne déjà 17,7 % d’épiques. Le compteur ne sert plus à rien en fin de partie.
- **E9.** Le profil chanceux fait sa 2e île en 5 min. C’est assumé dans BALANCE.md, et je suis d’accord.

---

## 4. Cohérence

### Importants
- **K1. Le tutoriel s’arrête à « Plante une graine »** (20 étapes).
  - Ces systèmes ne sont présentés que par des **toasts de 4 à 9 s**, introuvables ensuite : gardiens, onde de choc à sauter, Creuset et fusion, sets, pitié, nuit, Autel de Lune, tirage automatique, expéditions, faille, marchand, Contremaître, Ascension, reliques, défis.
  - DESIGN.md (§ 3, Gardiens) annonçait « Le premier gardien est annoncé par **un objectif** » : il n’existe pas.
  - Un joueur qui rate un toast (onglet en arrière-plan, panneau ouvert) ne saura jamais que la fusion existe.
- **K2. Rien n’annonce que l’Ascension est possible.** Le bouton couronne apparaît puis brille, sans toast ni objectif, alors que c’est la plus grosse nouveauté du jeu.
- **K3. Le bonus des graines affiché ne suit pas la règle.**
  - Le Jardin affiche `graines × 5 %` (`ui/talents.ts:57`) et le Phare « +5 % chacune » (`ui/panels.ts:531`). Au-delà de 100 graines, la règle réelle est `100 × (g/100)^0,8` (`effectiveSeeds`).
  - Exemple : à 1 000 graines, le Jardin affiche **+5 000 %** pour +3 155 % réels.
  - Cause : la formule est recopiée dans l’UI au lieu d’appeler `prestigeMult`.
- **K4. Le seuil des défis n’est pas celui promis.** DESIGN.md parle d’un Phare « à seuil réduit », mais `checkChallenge` utilise `islandThreshold` (seuil normal).

### Mineurs
- **K5.** « Ascension : ≈ 2,5 à 5,5 h » (DESIGN) et « 2,4 à 5,6 h » (BALANCE) : petites divergences de chiffres entre documents.
- **K6.** DECISIONS.md, itération 1, parle encore de « +10 % par graine », « seuil 400M » et « ×8 par prestige ». Ces sections sont historiques, mais rien ne le signale au lecteur.
- **K7.** Le texte d’un talent à plusieurs niveaux dit « (par niveau) (par niveau) » : la description de *Série ardente* contient déjà « par niveau » et l’UI l’ajoute (`ui/talents.ts:82`).

---

## 5. Interface

### Importants
- **U1. Le Jardin d’étoiles retombe dans le look rejeté.** Chaque talent est une **carte bordée identique**, empilée en colonne avec ombre et coins arrondis : exactement la « grille de cartes identiques » proscrite par DECISIONS.md § 3. Les autres panneaux utilisent des lignes de registre.
- **U2. Le HUD mobile mange l’écran** (capture 390×844) :
  - 4 cartouches de ressources (≈ 30 % de la hauteur) ;
  - 8 médaillons **sans libellé** en colonne à droite ;
  - l’objectif, Action et Saut en bas.

  Il reste environ 40 % de l’écran pour la scène, et les médaillons (Phare, Jardin, Nid, Runes, Atelier, Journal, Son, Carnet) ne se distinguent que par une icône de 20 px.
- **U3. L’Atelier et le Nid sont cassés en largeur sur mobile.**
  - Atelier : « Prisme / solaire / ×74 » sur trois lignes, « chacune » coupé, détails serrés dans une colonne étroite.
  - Nid : « 2.36× un coup toutes les 2 s » sur 4 lignes.
- **U4. Les nombres sont au format anglais dans un jeu entièrement en français** : « 23.4B », « ×15.96 », suffixes K/M/B/T. Un joueur français lit « B » sans comprendre (milliard = « Md »), et le point décimal jure avec le reste.

### Mineurs
- **U5.** Dans le tableau des probabilités de l’autel, la colonne « Pic ×1 / Veine ×4.3K / Géode ×1.1K » (runes possédées par rareté) n’a pas d’en-tête.
- **U6.** L’écran de pause multi-onglet (ajouté en C3) fige la dernière image. C’est voulu, mais le canevas peut rester vide si la pause arrive avant le premier rendu.
- **U7.** Pas de remappage des touches et une seule langue (connu).

---

## 6. Performance et qualité du code

### Importants
- **Q1. `game.ts` est un objet-dieu : 2 060 lignes, 132 membres privés.** Il fait l’orchestration, les entrées, la sauvegarde, les événements, les cinématiques et les toasts, sans **aucun test**. Les trois bugs critiques étaient tous dans cette colle (sauvegarde, rechargement, onglets), là où les tests n’allaient pas.
- **Q2. Des règles économiques sont dupliquées dans l’UI.**
  - `maxAffordable` recalcule les coûts (cause de B3).
  - Le bonus des graines est recopié en dur (cause de K3).
  - `pickTierOf` liste en dur les identifiants de pioche.

  La règle « l’économie reste pure et unique » est contournée par l’UI.
- **Q3. Tests manquants.**
  - `economy/objectives.ts` : les 20 étapes et les décalages d’index des migrations v1 et v4 sont fragiles.
  - `events2.ts` (faille, marchand) et `formatNumber` / `formatDuration`.
  - Les défis en campagne.
  - Le round-trip d’un état de fin de cycle.
  - Côté e2e : export/import et multi-onglet (seul le déplacement est testé).
- **Q4. Les performances ne sont pas mesurées.**
  - Les 60 fps ne sont pas vérifiés sur GPU, et aucun test ne borne les appels de dessin. Pourtant ~630 appels en Ultra, ~320 en Haute, et 67 à 90 mesurés en Économie sur mobile.
  - `GoldenCrystal.update` recrée de la géométrie.
  - Les célébrations SVG plein écran sont coûteuses.

### Mineurs
- **Q5.** Code mort : `core/events.ts` (`Emitter`).
- **Q6.** CI lente : `npm test` (≈ 45 s) rejoue déjà les campagnes d’équilibrage, puis `npm run simulate` les rejoue (≈ 50 s). C’est le même travail deux fois avant chaque déploiement.
- **Q7.** `vite.config.ts` est typé `as any` pour la clé `test` (il suffirait d’importer `defineConfig` depuis `vitest/config`).
- **Q8.** L’autosave sérialise tout l’état en JSON toutes les 10 s (≈ 4 Ko) : c’est sans conséquence, je le note pour mémoire.

---

## 7. Ce qui est bien (pour être juste)
- L’économie est réellement pure, testée, et le bot joue **tous** les systèmes : c’est rare et précieux. Les cibles d’équilibrage sont des tests qui bloquent le déploiement.
- La désérialisation est défensive champ par champ, et les migrations v1 → v4 sont testées.
- La direction artistique du monde et du Carnet tient sur la plupart des panneaux. Aucun emoji dans le code.
- L’enquête sur le bug « seule Z fonctionne » est exemplaire (causes racines, e2e qui échoue sur l’ancien code).
