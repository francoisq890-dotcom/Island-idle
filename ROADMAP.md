# ROADMAP — les 10 améliorations qui rendraient le jeu plus addictif et plus satisfaisant

Classées par **rapport impact / effort** (le meilleur d’abord), d’après l’audit (AUDIT.md). Les références E, K, U et B renvoient aux problèmes de l’audit.

**Taille du travail** :
- **S** : 1 à 2 jours ;
- **M** : 3 à 5 jours ;
- **L** : 1 à 2 semaines.

Chaque estimation inclut les tests, la simulation et les captures desktop et mobile exigées par CLAUDE.md.

**Priorité zéro (avant tout le reste).** Corriger les bugs importants qui faussent ces améliorations :
- B1, l’économie liée aux fps ;
- B2, le butin d’expédition qui traverse les îles ;
- B3, le « Max » de l’Atelier faux ;
- K3, le bonus des graines mal affiché.

Taille **S** au total. Ce ne sont pas des améliorations, ce sont des dettes.

| # | Amélioration | Pourquoi ça accroche | Impact | Effort |
|---|---|---|---|---|
| 1 | **Le « coffre du retour »** | Le moment le plus important d’un idle est le retour | Très fort | S |
| 2 | **« Prochaine découverte » toujours visible** | Toujours un but à moins de quelques minutes | Fort | S |
| 3 | **Carnet de route après le tutoriel** | Personne ne rate un système | Fort | S–M |
| 4 | **Une fin de cycle qui progresse encore** | Les dernières îles redeviennent les meilleures | Très fort | M |
| 5 | **HUD et panneaux mobiles compacts, nombres en français** | La moitié des sessions d’un idle se jouent sur téléphone | Fort | S–M |
| 6 | **Vue d’ensemble de l’archipel (touche V)** | Admirer son usine est la récompense propre à ce jeu | Moyen-fort | S–M |
| 7 | **Automatisation gagnée en reliques** | Le jeu monte d’un cran au lieu de se répéter | Fort | M |
| 8 | **Familiers qui évoluent** | Un puits durable pour les œufs et le Lumen | Moyen-fort | M |
| 9 | **Défis v2, jouables et mesurés** | Le contenu de la seconde couche | Moyen | M |
| 10 | **Une 5e île et une 6e machine** | Du contenu neuf, visible dans le monde | Fort, mais cher | L |

---

### 1. Le « coffre du retour » — S
Aujourd’hui, revenir après une nuit affiche deux nombres (éclats, Lumen). Le jeu travaille pourtant beaucoup pendant l’absence : expéditions revenues, nuits passées, gardiens manqués, Contremaître.

- **Faire.** Un écran « Pendant ton absence » qui se **déballe** ligne par ligne avec le son de tampon du Carnet :
  - production ;
  - dirigeables rentrés, dont le butin et les runes se réclament d’un geste avec le tirage animé ;
  - achats du Contremaître, simulés hors-ligne (corrige B4) ;
  - fragments des dragonnets.

  Et un « record d’absence » au Journal.
- **Impact.** Très fort pour la rétention : on revient pour ouvrir le coffre.

### 2. « Prochaine découverte » toujours visible — S
Le HUD montre l’objectif en cours, mais jamais **la prochaine nouveauté** : pont suivant, première nuit, premier gardien, Jardin, Ascension.

- **Faire.** Une ligne fine sous l’objectif, de la forme « Prochaine découverte : le Pont des Brumes, dans ≈ 2 min », avec une jauge. Elle se calcule à partir de `timeToAfford` et des conditions de déblocage existantes. Elle remplit aussi le manque de K2 : l’Ascension doit apparaître ici bien avant d’être possible.
- **Impact.** La boucle « encore une minute » des meilleurs incrémentaux tient à un but toujours proche et visible.

### 3. Carnet de route après le tutoriel — S–M
Le tutoriel s’arrête à « Plante une graine ». Quinze systèmes ne sont présentés que par des toasts éphémères (K1).

- **Faire.** Des objectifs de **découverte** prolongent les 20 étapes, un par système, au moment où il apparaît :
  - premier gardien (« saute l’onde de choc ») ;
  - première fusion, première nuit et Autel de Lune ;
  - tirage automatique, première expédition, premier marchand ;
  - Ascension, une relique, un défi.

  Chacun donne une petite récompense (fragments, œuf). Le Journal reçoit un onglet « Carnet de route » qui rassemble ces pages déjà vues, pour qu’on puisse les relire.
- **Impact.** Un système qu’on n’a pas compris, c’est du contenu perdu. Les fins de session « je ne sais plus quoi faire » disparaissent.

### 4. Une fin de cycle qui progresse encore — M
Aujourd’hui, les bonus sont à +380 % après l’île 1 et à +540 % après l’île 9, la chance est plafonnée dès l’île 5, et la dernière île est la plus longue (E1, E2, E3).

- **Faire.**
  - Les plafonds des runes **grandissent avec les îles du cycle** (et pas seulement avec les ponts), en rendement décroissant, et plus en butée dure.
  - La chance au-delà du plafond se convertit en **qualité** : copies bonus, fragments.
  - Lisser le seuil des îles 6 à 9, et faire en sorte que descendre rapporte toujours plus qu’attendre (E3).
  - Ajouter des cibles de simulation : « bonus de fin de cycle ≥ ×1,8 celui de l’île 1 » et « aucune île plus longue que la précédente au-delà de la 3e ».
- **Impact.** Très fort : c’est la différence entre « j’arrive au mur » et « je sens l’Ascension arriver ».

### 5. HUD et panneaux mobiles compacts, nombres en français — S–M
Sur mobile, environ 40 % de l’écran reste visible pour la scène : 8 médaillons sans libellé, des noms de machines sur trois lignes (U2, U3), et des nombres au format anglais (U4).

- **Faire.**
  - Les ressources tiennent sur une seule bande, avec un détail au toucher.
  - Les médaillons sont regroupés dans un éventail « Carnet ».
  - L’Atelier mobile passe sur deux lignes par machine, avec le sceau sous le nom.
  - `formatNumber` adopte la virgule décimale et les suffixes k, M, Md, Bn.
- **Impact.** Fort, et à faible coût.

### 6. Vue d’ensemble de l’archipel (touche V) — S–M
Le plaisir propre à ce jeu, c’est de **voir** son usine : tapis chargés, dirigeables, familiers, Phare. Aujourd’hui, on ne la voit qu’à hauteur d’explorateur, ou pendant les cinématiques de prestige.

- **Faire.**
  - Une caméra survol qui tourne lentement autour de l’archipel, sur le modèle de `cameraRig.cinematic`, avec la production qui défile en grand.
  - Chaque chantier s’ouvre d’un toucher depuis cette vue (sinon on achète à distance).
  - Un mode photo, sans HUD.
- **Impact.** Une satisfaction « admire ce que j’ai bâti » à très bon prix. C’est aussi le meilleur support de partage (captures).

### 7. Automatisation gagnée en reliques — M
Vers la 6e île, le joueur refait les mêmes gestes : tirer, fusionner, relancer les expéditions, refermer les failles.

- **Faire.** Quatre reliques ou talents d’Ascension :
  - fusion automatique des doublons ;
  - expéditions qui repartent seules ;
  - familier qui referme les failles ;
  - Contremaître qui achète aussi les améliorations.

  Chacun se débloque en réussissant un défi précis, comme les automates des incrémentaux à couches.
- **Impact.** Fort : la seconde couche **change la façon de jouer**, ce qui était le principe 1 de DESIGN.md.

### 8. Familiers qui évoluent — M
Le Nid est saturé dès l’île 2 ou 3 : familiers au niveau 25, œufs bon marché (E4).

- **Faire.**
  - **Éveil** : un familier au niveau maximal, plus un doublon d’espèce, donne une étoile (rareté +1), qui relève le niveau maximal et apporte un trait.
  - Une apparence qui change à chaque étoile (couronne de cristal, traînée).
  - Le prix des œufs suit la production de Lumen (comme le marchand).
- **Impact.** Moyen-fort : un attachement aux compagnons et une décision perché / expédition qui reste vivante.

### 9. Défis v2, jouables et mesurés — M
Les défis ne sont ni simulés ni à « seuil réduit » comme promis (E6, K4).

- **Faire.**
  - Un seuil propre à chaque défi.
  - Des récompenses à paliers (réussir en moins de X min).
  - 5 défis de plus, par exemple : sans runes, une seule île, familiers seuls, nuit éternelle avec Lumen ×2, coups uniquement.
  - Un affichage du record.
  - Le bot joue chaque défi, avec la cible « chaque défi entre 10 et 40 min après la 1re Ascension ».
- **Impact.** Moyen : c’est le contenu des joueurs engagés, et il prolonge la seconde couche de plusieurs heures.

### 10. Une 5e île et une 6e machine — L
DESIGN.md l’avait écarté pour son coût : disposition, ponts, tapis, équilibrage de la première île. C’est toujours vrai, d’où la dernière place malgré l’impact.

- **Faire.** Une île débloquée **après la première Ascension** (par exemple « les Racines du ciel », en vert profond), ce qui évite de rééquilibrer la première île. Elle apporte :
  - une 6e machine qui transforme le Lumen en graines de cycle ;
  - un 7e autel ;
  - une nouvelle famille de runes.
- **Impact.** Fort, et c’est ce que les joueurs remarquent. Mais l’effort est trois à cinq fois celui des points 1 à 3.

---

## Ce que je ne recommande pas
- **Des quêtes quotidiennes ou des récompenses de connexion.** Je suis d’accord avec DESIGN.md : elles punissent l’absence. Le « coffre du retour » (point 1) récompense le retour sans punir l’absence.
- **Une couche de prestige supplémentaire maintenant.** La 2e couche (Ascension) manque encore de contenu (points 7 et 9). En empiler une 3e diluerait l’effort.
