# DECISIONS — Les Îles d’Éther

Ce document explique les choix de design et de technique, et pourquoi.

## 1. Technique

### Stack : Vite + TypeScript + Three.js (r187), moteur maison léger par-dessus
- **Three.js** fournit un rendu WebGL2 solide (ombres, instancing, post-process) : réécrire un moteur de rendu n’aurait rien apporté de visible au joueur dans le temps imparti.
- Par-dessus, une **couche moteur maison** minimale et lisible : boucle de jeu, tweens (`core/tween.ts`), bus d’événements, entrées unifiées clavier/souris/tactile (`core/input.ts`), bruit procédural (`core/noise.ts`).
- **Pas de framework UI** (React…) : le HUD est petit, du DOM natif + CSS suffit et évite une dépendance lourde. Les panneaux mettent à jour le texte en place (pas de re-rendu complet) pour que les boutons ne « clignotent » pas pendant les clics.
- **Vitest** pour les tests, **tsx** pour le script de simulation. Aucun autre runtime.

### Séparation du code
```
src/config/    toutes les données : économie (fichier unique), palette, disposition du monde
src/economy/   règles pures (aucune dépendance au rendu) : coûts, taux, tick, prestige, hors-ligne, objectifs, simulation
src/save/      sauvegarde versionnée + migrations + export/import texte
src/world/     tout le 3D : terrain procédural, décor instancié, machines, convoyeurs, ponts, joueur, caméra, particules
src/ui/        HUD, panneaux, icônes SVG, styles
src/audio/     synthèse Web Audio (effets + musique générative)
src/game.ts    orchestration : boucle, entrées → actions, synchronisation économie ↔ monde ↔ UI ↔ audio
```
L’économie est **pure** : la même fonction `computeRates` sert au jeu, aux tests et au bot de simulation.

### Rendu et performance
- **Tout est généré en code** : îles (maillage polaire bruité, flat shading, couleurs par face), arbres, rochers, machines, personnage, nuages. Aucun asset externe → aucun problème de licence, et un build très léger.
- **Instancing partout** où c’est répété : arbres, touffes d’herbe, fleurs, rochers, nuages, machines (2 `InstancedMesh` par type : corps + pièce animée), planches des ponts, cubes de ressources sur les tapis, particules. Le décor complet coûte ~10 draw calls.
- **Une seule matière « flat + vertex colors + masque émissif par sommet »** (`geom.makeMaterial`) : les parties lumineuses (cristaux, voyants) sont marquées dans un attribut `emit`, ce qui permet au bloom de ne toucher qu’elles sans textures ni matériaux supplémentaires.
- **Post-processing** : rendu HDR (HalfFloat, MSAA ×4) → bloom (seuil haut, seuls les émissifs brillent) → étalonnage maison (saturation, teinte chaude, vignettage, flash pour le prestige) → tonemapping ACES.
- **Ombres** : une seule lumière directionnelle dont la caméra d’ombre suit le joueur (alignée sur la grille des texels pour éviter le scintillement).
- **Résolution adaptative** : en mode « Automatique », le ratio de pixels baisse si la médiane des frames dépasse 20 ms et remonte quand il y a de la marge. Mode « Économie » : pas d’ombres ni de bloom.
- Les arbres situés entre la caméra et le joueur **rétrécissent** pour ne jamais masquer l’action.

### Sauvegarde
- `localStorage`, sauvegarde automatique toutes les 10 s + à la fermeture / changement d’onglet.
- Format versionné (`version`), table de **migrations** prête, et une désérialisation **défensive** : chaque champ est validé et fusionné sur un état par défaut, une sauvegarde partiellement corrompue ne casse pas le jeu.
- Export/import en texte : `ILES1.` + base64(JSON UTF-8). Le JSON brut est aussi accepté à l’import.

### Hors-ligne
- Les taux de production ne changent qu’à l’achat. Le gain hors-ligne est donc **exact** : `taux × durée` (y compris les raffineries, car leur prélèvement est proportionnel à la production). Plafond : 8 h, efficacité 100 %.
- Écran « Bon retour ! » au lancement si l’absence dépasse 1 min ; un retour d’onglet après plus de 2 min est aussi crédité.

### Audio
- **100 % synthétisé** (Web Audio) : tintement cristallin dont la hauteur monte en combo (gamme pentatonique), thump de construction, arpèges d’achat, planches du pont, blips d’arrivée au Nexus (limités en fréquence), grand accord du prestige.
- Musique d’ambiance **générative** : nappe d’accords (Ré majeur) + carillons aléatoires + vent filtré. Volumes séparés et coupure (touche M).

## 2. Design

### Concept retenu (celui du brief, précisé)
Une petite île flottante low-poly au coucher du soleil. Le joueur, un petit explorateur à pioche, récolte un **cristal d’éther** à la main, puis construit des machines **physiquement placées** sur des chantiers balisés. Les éclats roulent sur des **tapis roulants** jusqu’au **Nexus** central, qui tourne plus vite et brille plus fort quand la production augmente.

### Ressources (volontairement deux seulement)
- **Éclats** (cyan) : la ressource de base.
- **Lumen** (or) : produit par les raffineries à partir des éclats ; sert aux ponts et aux machines rares.
- **Graines d’étoile** (violet) : monnaie de prestige, +10 % de production chacune, pour toujours.
La couleur est un code constant dans tout le jeu : cyan = brut, or = raffiné, violet = prestige (HUD, cubes sur les tapis, particules, icônes).

### Machines
| Machine | Île | Rôle |
|---|---|---|
| Foreuse | Île Mère | premier générateur, bon marché |
| Excavatrice | Île Mère | ×6 plus productive, plus chère |
| Raffinerie | Îlot des Forges | convertit 10 éclats → 1 Lumen |
| Geyser d’éther | Îlot des Geysers | production massive d’éclats |
| Prisme solaire | Île Céleste | produit éclats **et** Lumen |

- **Coûts exponentiels** `base × 1.15^n`. **Paliers** à 25, 50, 100… machines : production ×2 (le joueur voit la barre du prochain palier dans l’info-bulle).
- **Visibilité physique** : chaque chantier a 5 à 12 emplacements. Chaque achat fait apparaître une machine (animation « outBack », poussière, étincelles, léger screen shake). Au-delà des emplacements, toutes les machines du chantier rebondissent et **grandissent / changent de teinte** à chaque palier. Un hologramme montre où la prochaine apparaîtra.
- **Raffinerie** : elle ne prélève **jamais plus de 50 %** de la production d’éclats. Choix délibéré : un convertisseur qui peut affamer toute l’économie est frustrant dans un idle. L’info-bulle explique clairement quand les raffineries manquent d’éclats.
- **Convoyeurs** : plutôt qu’un placement manuel case par case (friction sans intérêt dans un idle), ils sont **posés automatiquement** entre chaque chantier et le Nexus, et les améliorations « Convoyeurs » les accélèrent visiblement. La densité de cubes suit le logarithme de la production : plus tu produis, plus les tapis sont chargés.

### Zones
Trois îlots se débloquent dans l’ordre avec un pont (planches, pont de corde, escalier céleste). La construction déclenche une courte **cinématique** : les planches jaillissent une à une. Les îles verrouillées sont visibles dès le début : elles servent d’objectif visuel.

### Prestige : « faire descendre l’île »
- Le **Phare des étoiles** se trouve sur l’Île Céleste (la dernière zone) : le prestige est un lieu, pas seulement un bouton.
- Il s’éveille (faisceau violet) quand l’île a produit 400M éclats. Gain : `floor(√(éclats de l’île / 10M))` graines.
- La fenêtre explique simplement **ce qu’on perd / ce qu’on garde** et le bonus avant → après.
- Séquence : plan large, flash violet, l’archipel s’enfonce dans les nuages, puis une **nouvelle île repousse avec une nouvelle saison** (automne, floraison, aurore…) — le prestige change visiblement le monde.

### Tutoriel diégétique (piliers « compréhensible en 30 secondes »)
- Un objectif court en haut de l’écran, avec barre de progression et une ligne d’aide.
- Une **balise lumineuse** dans le monde + une **flèche au bord de l’écran** quand la cible est hors champ.
- 17 étapes scénarisées (marcher → récolter 10 → 1re foreuse → 3 foreuses → amélioration → … → prestige), puis des objectifs dynamiques (« Construis le pont X, dans 1 min 20 s »).
- Le bouton Atelier pulse quand l’objectif le demande. La première machine de chaque type doit être posée **sur place** (bouton « Y aller » + balise) : ça pousse à explorer les nouvelles îles ; ensuite on peut acheter à distance depuis l’Atelier.
- **Aucun chiffre sans contexte** : chaque coût affiche le temps restant (« dans 42 s »), chaque machine sa production, sa part du total et le prochain palier.

### Direction artistique
Palette restreinte (`src/config/palette.ts`) : ciel lavande → pêche, herbes vert tendre, roches sable/terre cuite, machines crème + cuivre + ardoise. Chaque îlot a sa teinte (forges ocre/volcaniques, geysers turquoise, île céleste lavande). Lumière chaude rasante, ombres douces, brouillard couleur horizon, mer de nuages animée.

## 3. Équilibrage
- Tous les nombres sont dans `src/config/economy.ts`.
- `npm run simulate` fait jouer un **bot** (3 profils : actif, moyen, paresseux) qui achète toujours l’option au meilleur temps de retour et ouvre les zones dès que possible.
- Résultats actuels (bot quasi optimal, donc un humain sera un peu plus lent) :
  - plus longue attente entre deux achats sur les 10 premières minutes : **~1 min 30 s** (cible < 3 min) ;
  - prestige disponible entre **32 et 43 min** selon le profil (cible 30–45 min) ;
  - une deuxième île avec les graines gagnées va plus vite (test `balance.test.ts`).
- Ces contraintes sont aussi vérifiées par les tests unitaires et par la CI avant chaque déploiement.

## 4. Ce que j’ai volontairement coupé
- Placement libre des machines sur une grille : remplacé par des chantiers balisés (plus lisible, moins de friction).
- Une 3e ressource intermédiaire et un arbre de prestige : le brief demande un prestige « simple et bien expliqué ».
- Des modèles importés : tout est procédural, ce qui garde une cohérence artistique parfaite.

---

# Itération 2

## 1. Bug de déplacement (« seule Z fonctionne »)

**Enquête.** Le symptôme exact n'a pas pu être reproduit dans Chromium. J'ai testé la logique du joueur à 60 et 144 Hz, de vrais événements clavier, le build de production et des événements reproduisant exactement un clavier AZERTY (`key: 'q'`, `code: 'KeyA'`) : tout bougeait. En cherchant ce qui pouvait différer chez un joueur, j'ai trouvé trois vraies causes. Chacune donne « j'appuie et rien ne se passe » :

1. **Dépendance stricte à `KeyboardEvent.code` sur quatre valeurs (KeyW/A/S/D).** `code` est censé être physique, mais certains environnements renvoient un code *dépendant de la disposition* ou *vide* : Firefox avec `privacy.resistFingerprinting` (aussi Tor, LibreWolf, Mullvad), certaines VM, bureaux à distance et claviers matériels mobiles. En AZERTY on reçoit alors `KeyZ`/`KeyQ`, que l'ancien code ignorait. Avec un `code` vide, plus aucune direction ne marche.
2. **Le joueur pouvait être emprisonné dans un décor.** Le premier emplacement de foreuse est à ~0,9 m du panneau où l'on appuie sur E. La foreuse apparaissait donc souvent *sur* le joueur. Le contrôleur refusait toute position à l'intérieur d'un obstacle, y compris pour en sortir : toutes les touches semblaient mortes.
3. **Focus capturé.** Après avoir touché un curseur de volume ou un menu déroulant, le focus restait sur ce contrôle et toutes les touches étaient ignorées.

**Correctifs (à la racine, pas des rustines).**
- Le clavier est traduit en **actions** (`up/down/left/right`). La référence reste `code` (physique), et les deux jeux de lettres sont mappés (`KeyW|KeyZ` = avancer, `KeyA|KeyQ` = gauche). Quand `code` est vide ou « Unidentified », on se rabat sur `key` (z/w/q/a/s/d, flèches). Les touches tenues sont suivies par jeton (code, ou `key:x`), pour qu'un `keyup` relâche toujours la bonne touche.
- Toutes les touches sont relâchées à la perte de focus, au changement d'onglet et quand on tape dans un champ texte (plus de joueur qui « court tout seul »). Un appui clavier retire le focus des boutons, curseurs et listes.
- Collisions : `Ground.canMove(from, to)` accepte un déplacement s'il mène sur un sol libre, **ou** s'il réduit le chevauchement quand le joueur est déjà dans un obstacle. On ne peut plus être coincé.
- Le mode tactile n'est plus activé sur les PC portables à écran tactile (`'ontouchstart' in window` était vrai sur ces machines) ; il s'active au premier vrai toucher.

**Tests.**
- `npm run test:e2e` (Playwright) : 41 cas vérifiés, chacun relatif à la caméra (avec deux orientations de caméra) avec une tolérance d'angle.
  - Claviers : QWERTY, AZERTY, codes dépendant de la disposition, codes vides, flèches.
  - Diagonales, avec un vecteur d'entrée normalisé à 1.
  - Sortie d'une machine construite sur le joueur.
  - Joystick tactile dans les 4 directions.
- Sur l'ancien code, ce test échoue sur 7 cas, ce qui prouve qu'il couvre bien le bug. Il tourne en CI avant chaque déploiement.
- Tests unitaires du mapping et des collisions : `tests/input.test.ts`.

## 2. La pioche

**Cause du mauvais geste.** Le gain, les étincelles et le son étaient déclenchés *au clic*, au moment où le bras commençait seulement à monter. La phase suivante (65 % de la durée) ramenait lentement le bras : on voyait donc « l'impact » suivi d'un bras qui part en arrière. L'arc lui-même passait par le bas du corps, pas par-dessus l'épaule.

**Nouvelle frappe**, une machine à états dans `Player`. θ est l'angle de l'épaule : 0 = bras le long du corps, π = bras au-dessus de la tête.

| Phase | Durée | Ce qui se passe |
|---|---|---|
| Armé | 0,13 s | La pioche monte devant puis par-dessus l'épaule (θ 0,25 → 3,5). Le buste part en arrière. L'explorateur **se tourne vers le cristal** et **fait un pas** pour être à portée ; la frappe attend d'être alignée. |
| Anticipation | 0,06 s | Petit recul supplémentaire (θ → 3,78). |
| Frappe | 0,075 s | Arc rapide par-dessus la tête vers le bas (θ → 1,02, accélération cubique). Souffle sonore, traînée lumineuse. |
| Impact | 0,055 s (≈3 frames) | **Hit-stop** : la pose est gelée. C'est *ici* que tombent le gain, les étincelles, le son, le nombre flottant et le tremblement. |
| Rebond | 0,09 s | Petit rebond sur le cristal. |
| Retour | 0,2 s | Retour au repos. |

- Prise à deux mains : le bras gauche suit le geste.
- Les clics sont mémorisés (un en attente) et s'enchaînent sans repasser par le repos : environ 3 coups/s, ce qui reste cohérent avec le bot d'équilibrage. La vitesse est un multiplicateur (`strikeSpeed`) que les runes pourront augmenter.

**7 modèles** (pioche de départ + 6 améliorations ; deux améliorations ajoutées : *Pioche des marées*, *Pioche de l'Aube*) :

| Palier | Pioche | Aspect | Traînée |
|---|---|---|---|
| 0 | Départ | bois et fer | aucune |
| 1 | Renforcée | bagues de cuivre, acier | traînée crème |
| 2 | Quartz | tête rose translucide | traînée rose |
| 3 | Résonante | cristal d'éther cyan lumineux | traînée cyan, lumière portée |
| 4 | Étoile | or, cœur étoilé | traînée dorée |
| 5 | Marées | double lame d'obsidienne à liseré violet, anneaux runiques en orbite | traînée violette |
| 6 | Aube | lames tricolores, éclats en orbite | traînée arc-en-ciel cyan → or → violet |

- Les étincelles, le tremblement et le son d'impact (couches graves et harmoniques ajoutées) grandissent avec le palier.
- **Changement de palier** : l'explorateur brandit la nouvelle pioche à deux mains au-dessus de sa tête (pose « objet obtenu »), avec gerbe de lumière, fanfare montante et annonce à l'écran.

## 3. Direction artistique de l'interface : « le Carnet du Cartographe »

**Idée.** L'explorateur tient le carnet d'un cartographe des îles flottantes. Le joueur ne lit pas un tableau de bord d'application : il ouvre un **carnet de vélin relié de laiton**, annoté à l'encre, où les éclats d'éther sont notés à l'encre cyan, le Lumen à la feuille d'or et les graines d'étoile à l'encre violette. Ce matériau colle au monde (machines crème, cuivre et laiton, coucher de soleil chaud) et tourne le dos au style « IA générique » : pas de verre sombre flouté, pas de dégradés décoratifs, pas de grilles de cartes identiques.

**Matériaux.**
- *Vélin* : papier crème **opaque** (`#f3e6cc`), grain très léger (bruit SVG en ligne). La lisibilité sur la scène 3D ne dépend plus du flou.
- *Laiton* : cadres, rivets, médaillons, boutons. Rendu par aplats et arêtes nettes (reflet clair en haut, ombre franche en bas), pas par dégradés. Le cadre des panneaux est un neuf-quartiers SVG (`border-image`) avec rivets et équerres d'angle.
- *Encre* : texte prune foncé (`#2a2035`), filets gravés (ligne + losange central) comme séparateurs.
- Ombres « physiques » : décalage net sous les objets en laiton, une seule ombre douce pour détacher le panneau du décor.

**Typographie** (incluse dans le build via fontsource, licence OFL) :
- *Fraunces* (variable, axes SOFT et WONK) pour les titres, les noms et **les nombres importants** : un sérif doux et un peu bancal, qui a du caractère et rappelle les cartes anciennes.
- *Alegreya Sans* pour le texte courant : humaniste, très lisible en petite taille, chiffres tabulaires pour les compteurs.

**Palette UI.**

| Rôle | Valeur |
|---|---|
| Vélin | `#f3e6cc` / rangées `#ead8b6` / clair `#fbf3e2` |
| Encre | `#2a2035` / `#5d4e66` / `#8c7c86` |
| Laiton | `#c38a3c` / reflet `#ebbd6a` / ombre `#7d5321` |
| Encre d'éther (éclats) | `#138aa6` (lisible sur papier) |
| Feuille d'or (Lumen) | `#a86b0c` |
| Encre violette (graines) | `#6f45b8` |
| Bon | `#3f7f43` |
| Mauvais | `#a8433a` |

**Icônes.** Toutes dessinées en SVG pour le jeu, dans un style *gravure* : contour à l'encre de 1,6 px + aplats de la palette. Aucun emoji.

**Hiérarchie.** Dans chaque panneau, une ligne = une décision.
- L'œil voit d'abord **le nom** et **ce que ça rapporte** (gros, en couleur de la ressource), puis **le prix**, porté par le bouton de laiton.
- Le reste (part du total, palier, délai) est en petit, à l'encre pâle.
- Les rangées sont des **lignes de registre** séparées par des filets, pas des cartes.

**Mouvement et son.**
- Les panneaux se *déplient* : rotation en X + échelle depuis le haut, avec léger dépassement. Les lignes apparaissent en cascade (40 ms d'écart).
- À la fermeture, le panneau se replie vite (180 ms).
- Sons synthétisés : papier qui se déplie avec un déclic de laiton, page qui tourne pour les onglets, petit tic de bois au survol, pièces au paiement.
- Le bouton d'achat est un *sceau de laiton* : il se soulève au survol avec un reflet qui balaie la surface, s'enfonce à la pression, puis tamponne la ligne (« ✓ » à l'encre) quand l'achat réussit. S'il est trop cher, il devient une simple gravure en creux avec une jauge qui se remplit.

## 4. Système de runes

**Recherches.** Sources : guides et wikis de fans d'*Ascender/Ascension Incremental*, *Noob Incremental*, *Luck Incremental*, et pages de codes. Mécaniques communes retenues :
- des **pools par zone** avec un coût par tirage ;
- une **table de rareté fixe** dont le dernier palier est de l'ordre de 1 sur plusieurs millions ;
- une **chance** (luck) qui pousse les tirages vers le haut ;
- la **charge** (bulk : plusieurs runes par tirage) et la **vitesse** de tirage améliorables ;
- un **tirage automatique** débloqué plus tard ;
- des **doublons** qui s'additionnent, et un **index** de collection.

Les noms, les effets, les visuels et les chiffres sont originaux.

**Design.**
- **4 familles**, une par île, chacune avec son **autel physique** : Pierre (production, coups), Braise (Lumen, critiques, coûts), Brume (chance, vitesse, hors-ligne), Astre (production massive, graines). On marche jusqu'à l'autel pour tirer à la main ; le tirage automatique, lui, marche de partout.
- **7 raretés** :

| Rareté | Chance de base |
|---|---|
| Commune | le reste |
| Peu commune | 1/5 |
| Rare | 1/14 |
| Épique | 1/90 |
| Légendaire | 1/1 200 |
| Mythique | 1/30 000 |
| Céleste | **1/1 000 000** |

- **La chance** divise les dénominateurs (« 1 sur N » devient « L sur N »), répartis de la rareté la plus haute vers la plus basse : les probabilités restent toujours valides. Elle s'améliore par l'autel (Chance), par certaines runes, par les succès et par les graines d'étoile (+2 % chacune). Les probabilités **réelles**, chance comprise, sont affichées dans le panneau.
- **Effets en %**, chaque doublon compte : bonus total = valeur × copies^0,6 (rendement décroissant). Plafonds :

| Effet | Plafond |
|---|---|
| Coûts | −60 % |
| Critique | 50 % |
| Vitesse | +150 % |
| Hors ligne | +200 % |
| Graines | +100 % |

- **Progression du tirage** :
  - améliorations d'autel *Chance*, *Charge* (+1 rune par tirage, max +4), *Cadence* et *Tirage automatique* ;
  - chaque tirage rend le suivant de cette famille 1,8 % plus cher (remis à zéro à la descente) ;
  - **le tirage automatique n'utilise jamais plus de 10 % de la production**, pour ne jamais bloquer les achats.
- **Retour visuel** :
  - colonne de lumière de la couleur de la meilleure rune, onde de choc dès « rare » ;
  - chaque tirage a son carillon, qui monte avec la rareté ;
  - à partir de « légendaire » : **ralenti**, flash coloré, annonce plein écran avec rayons, fanfare.
- **Prestige** : seules les runes **légendaires et plus rares** survivent. Avec la chance et la charge, les épiques deviennent fréquentes en fin d'île : les garder rendait la deuxième île triviale (mesuré : 49 s). Garder seulement les très rares donne une vraie chasse à long terme, et chaque nouvelle île redonne de la valeur aux premiers tirages. Le tirage automatique, simple confort, est conservé.

## 5. Plus de gameplay

- **Événements aléatoires** :
  - *pluie de météores* (toutes les 4 à 6 min) : des éclats tombent sur l'île, on marche dessus pour les ramasser (aimant de 3,6 m) ;
  - *cristal doré* (toutes les 5 à 9 min) : 12 coups en 25 s, sinon il s'éteint.

  Les récompenses sont exprimées en *secondes de production* : elles restent utiles à tout moment de la partie. Ils obligent à bouger et à regarder l'île.
- **Coups critiques** (×5), apportés par les runes de Braise.
- **32 succès** à bonus permanents, consultables dans le Journal (touche J), certains secrets.
- **4 synergies** entre machines, par exemple « Foreuses : +2 % par excavatrice ».
- **Paliers** : chaque type de machine double à 25, 50, 100, 150… exemplaires (déjà présents, désormais aussi suivis par les succès).
- **Objectif de long terme : les Constellations.** Les graines d'étoile gagnées au total allument des constellations qui rendent *chaque nouvelle île* plus forte :

| Graines au total | Avantage |
|---|---|
| 5 | 5 foreuses de départ |
| 15 | Pont des Forges déjà construit |
| 40 | Chance d'autel au niveau 5 |
| 100 | Production ×2 |
| 200 | Cristaux dorés deux fois plus fréquents |
| 350 | Deux premières pioches offertes |
| 600 | Production ×3 |

  Le Phare demande **8× plus** d'éclats après chaque descente (et donne plus de graines), pour que chaque île reste un vrai objectif.

## 6. Rééquilibrage

Le bot (`src/economy/simulation.ts`) :
- tire des runes quand l'espérance de gain d'un tirage bat ses autres options ;
- achète les améliorations d'autel et active le tirage automatique (avec la même règle des 10 %) ;
- fait des critiques, ramasse 75 % des récompenses d'événements et débloque les succès.

Premier passage après l'ajout des runes : prestige en **6 min**, +1 400 % de production via les runes, deuxième île en 49 s. Corrections, une par cause mesurée :
- récompenses d'événements divisées par environ 5 (9 météores × 35 s de production toutes les 5 min doublaient le revenu) ;
- exposant de cumul 0,8 → 0,6, valeurs par copie réduites, coût de tirage croissant ;
- améliorations d'autel bien plus chères, et la Charge demande du Lumen ;
- seules les légendaires+ survivent, le bonus de graines est plafonné ;
- auto-tirage limité à 10 % du revenu (à 10 % de la *réserve*, il vidait le stock chaque seconde) ;
- seuil du Phare 8e9 ; ×8 par prestige ; +5 % par graine ;
- les pioches donnent +3 % (au lieu de +5 %) de la production par coup : l'écart entre un joueur qui clique beaucoup et les autres était trop grand.

Résultats (`npm run simulate`) :

| Profil | 1er prestige | Attente max. (10 premières min) |
|---|---|---|
| Moyen (2 coups/s pendant 10 min) | **36 min** | 40 s |
| Paresseux (1 coup/s pendant 3 min) | **40 min** | 46 s |
| Optimal (3 coups/s sans pause, décisions instantanées, sans marcher) | 26 min (borne basse, un humain sera plus lent) | 35 s |

- Sans runes, le profil moyen met 59 min : les runes accélèrent ×1,6, elles comptent sans écraser le reste.
- **Deuxième île** : 8 min (au lieu de 36), avec 54 graines au lieu de 32. Nettement plus rapide et plus généreuse.
- Ces cibles sont vérifiées par `tests/balance.test.ts` et par la CI.
