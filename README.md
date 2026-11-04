# Les Îles d’Éther

Un jeu incrémental (idle / clicker) **en 3D** dans le navigateur. Tu incarnes un petit explorateur sur une île flottante au coucher du soleil : tu récoltes un cristal d’éther à la pioche, tu construis des machines **posées physiquement sur l’île**, tu regardes les éclats rouler sur les tapis jusqu’au Nexus, tu relies de nouveaux îlots par des ponts… puis tu fais **descendre l’île** dans la mer de nuages pour en faire pousser une nouvelle, plus fertile.

**▶ Jouer :** https://francoisq890-dotcom.github.io/Island-idle/
*(le lien fonctionne une fois GitHub Pages activé, voir « Déploiement » plus bas)*

| | |
|---|---|
| ![Archipel en pleine production](docs/archipel.png) | ![Foreuses et info-bulle](docs/foreuses.png) |
| ![Nouvelle île après le prestige (automne)](docs/prestige-automne.png) | ![Version mobile](docs/mobile.png) |

## Lancer en local

```bash
npm install
npm run dev        # http://localhost:5173
```

Autres commandes :

| Commande | Rôle |
|---|---|
| `npm test` | tests unitaires (économie, sauvegarde, hors-ligne, équilibrage) |
| `npm run simulate` | rapport d’équilibrage : un bot joue la première île (`-- --verbose` pour le détail) |
| `npm run build` | build de production dans `dist/` (≈ 190 Ko gzip) |
| `npm run preview` | sert le build de production |

## Commandes

| Action | Clavier / souris | Tactile |
|---|---|---|
| Marcher | **ZQSD** (AZERTY) ou **WASD** (QWERTY) ou flèches, diagonales comprises | joystick : glisser sur la moitié gauche de l’écran |
| Tourner la caméra | glisser avec la souris | glisser sur la moitié droite |
| Zoom | molette | pincer |
| Frapper le cristal | clic dessus, ou **E** à côté (maintenir = coups enchaînés) | toucher le cristal, ou bouton **Action** (maintenir) |
| Construire / interagir | **E** près d’un chantier, d’un pont, d’un autel, du Phare (ou clic dessus) | bouton **Action** |
| Sauter | **Espace** | bouton flèche |
| Atelier (machines, améliorations) | **B** | bouton marteau |
| Autel des runes | **R** (ou E devant un autel) | bouton rune |
| Journal (succès, constellations) | **J** | bouton trophée |
| Phare (prestige) | **P** | bouton Phare |
| Son on/off | **M** | bouton haut-parleur |
| Carnet de bord (réglages, sauvegarde, stats) | **Échap** | bouton carnet |

Le clavier fonctionne en AZERTY comme en QWERTY, y compris dans les navigateurs qui renvoient des codes de touches dépendants de la disposition (voir DECISIONS.md § 1).

## Nouveautés de l’itération 2

- **Déplacement corrigé** et couvert par un test Playwright automatique : 41 cas (QWERTY, AZERTY, codes dépendants de la disposition, codes vides, flèches, diagonales, caméra tournée, joystick, sortie d’une machine construite sur le joueur).
- **Vraie frappe de pioche** : armé au-dessus de l’épaule, anticipation, arc rapide vers le cristal, *hit-stop*, étincelles, rebond. L’explorateur se tourne et fait un pas vers sa cible. **7 pioches** au look de plus en plus spectaculaire (traînées, lumière, éclats en orbite), avec une scène de « nouvelle pioche ».
- **Nouvelle interface « Carnet du Cartographe »** : vélin, laiton, encre, polices Fraunces et Alegreya Sans, icônes SVG dessinées pour le jeu, boutons-sceaux, panneaux qui se déplient, sons d’interface.
- **Runes** :
  - 4 autels (un par île), 28 runes en 7 raretés jusqu’à 1 sur 1 million, probabilités affichées et ajustées par la chance ;
  - charge, cadence et tirage automatique ;
  - célébration au ralenti pour les grandes raretés ;
  - index de collection ;
  - les runes légendaires et plus survivent au prestige.
- **Événements** : pluie de météores et cristal doré. **Coups critiques**, **32 succès** à bonus permanents, **synergies** entre machines.
- **Constellations** : objectif de long terme après le premier prestige, avec des avantages permanents pour chaque nouvelle île.
- **Rééquilibrage complet** avec un bot qui utilise tous ces systèmes (voir plus bas).
- Les sauvegardes de la première version sont **migrées automatiquement** (format v2).

## Ce que contient le jeu

- **Monde 3D** généré en code : 4 îles flottantes, mer de nuages, lumière de coucher de soleil, ombres, bloom, étalonnage. Les arbres qui masquent le joueur s’effacent.
- **5 machines** posées physiquement sur l’île, animées, avec paliers (×2 à 25/50/100…). Des **convoyeurs** amènent cubes d’éclats et de Lumen jusqu’au Nexus.
- **3 ponts** construits en cinématique, **20 améliorations + 4 synergies**.
- **Prestige** au Phare des étoiles : l’île descend dans les nuages et repousse avec une nouvelle saison. Les graines d’étoile donnent +5 % de production chacune ; le Phare demande davantage à chaque île.
- **Hors-ligne** (8 h max) avec écran « Bon retour ! ». **Tutoriel** de 18 objectifs avec balise et flèche au bord de l’écran.
- **Audio 100 % synthétisé** : effets, carillons des runes, fanfares, musique générative.
- **Sauvegarde** automatique versionnée, export/import texte.
- **Tests** : 46 tests Vitest (économie, runes, succès, sauvegarde et migration, hors-ligne, clavier, collisions, équilibrage) + test Playwright de déplacement, lancés en CI avant chaque déploiement.

## Équilibrage (`npm run simulate`)

| Profil du bot | 1er prestige | Attente max. au début | Remarque |
|---|---|---|---|
| Moyen (2 coups/s pendant 10 min) | **36 min** | 40 s | sans runes : 59 min (runes ×1,6) |
| Paresseux (1 coup/s pendant 3 min) | **40 min** | 46 s | |
| Optimal (3 coups/s sans pause, sans marcher) | 26 min | 35 s | borne basse, un humain est plus lent |
| 2e île (profil moyen) | **8 min** | | 54 graines au lieu de 32 |

## Déploiement (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` lance les tests unitaires, la simulation, le test de déplacement, construit le jeu et publie `dist/` sur GitHub Pages à chaque push sur `main`.

## Tests

```bash
npm test            # Vitest : 46 tests
npm run test:e2e    # Playwright : déplacement clavier (AZERTY/QWERTY) et joystick
npm run simulate    # rapport d’équilibrage
```

## Limites connues / reste à faire

- Les 60 fps n’ont pas pu être mesurés sur une vraie carte graphique ici (rendu logiciel en headless). Les compteurs sont raisonnables : ~150 appels de dessin toutes passes comprises sur une partie avancée. La résolution adaptative et le mode « Économie » compensent.
- Le bug « seule Z fonctionne » n’a pas pu être reproduit à l’identique dans Chromium. Trois vraies causes ont été trouvées et corrigées (codes de touches dépendants de la disposition ou vides, joueur emprisonné par une machine, focus capturé par un curseur). Si le problème persiste chez toi, le nom et la version de ton navigateur m’aideraient.
- Au-delà des emplacements d’un chantier (5 à 12), les nouvelles machines ne s’ajoutent plus visuellement : celles qui existent grandissent et changent de teinte aux paliers.
- Pas de remappage des touches ; textes en français uniquement.
- Le bot d’équilibrage est quasi optimal : un joueur réel mettra un peu plus longtemps que les chiffres ci-dessus.

## Structure

```
src/config/    économie, runes, succès, événements, constellations, palette, disposition du monde
src/economy/   règles pures (économie, runes, succès, bonus, hors-ligne, objectifs, bot de simulation)
src/save/      sauvegarde versionnée + migrations
src/world/     rendu 3D : terrain, décor, machines, convoyeurs, ponts, autels, événements, joueur, pioches, caméra, particules
src/ui/        HUD, panneaux (Atelier, Autel des runes, Journal, Carnet de bord), icônes, CSS
src/audio/     synthèse sonore
src/game.ts    orchestration
tests/         Vitest
scripts/       simulation, test de déplacement Playwright, captures d’écran
```

Voir **DECISIONS.md** pour les choix de design et de technique (et la direction artistique de l’interface).
