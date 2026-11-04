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
