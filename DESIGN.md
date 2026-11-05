# DESIGN — Les Îles d’Éther, itération 3

> **Statut** : tout ce qui est décrit ici est implémenté et déployé. Les chiffres ont été ajustés par la passe d’équilibrage globale : voir BALANCE.md (seuil du Phare, plafonds des runes, Constellations ×1,5 et ×2, Ascension à 1 000 graines).

Ce document décrit **où va le jeu** : la progression complète, les nouveaux systèmes et la façon dont ils s’emboîtent dans l’économie existante. Les choix ponctuels et leurs raisons vont dans `DECISIONS.md`, les chiffres mesurés dans `BALANCE.md`.

---

## 1. Recherche : ce qui fait tenir un incrémental

J’ai repris des **mécaniques**, jamais des noms ni des visuels.

| Jeu | Mécanique retenue | Ce qu’elle apporte | Ce que j’en fais ici |
|---|---|---|---|
| **Antimatter Dimensions** | Couches de prestige successives (Infinité → Éternité), chacune débloquant un *nouveau type de jeu* : défis, arbre d’études avec branches exclusives, automates débloqués par les défis. | Chaque couche change la façon de jouer, pas seulement les chiffres. | Seconde couche (« Ascension ») qui débloque les **Défis** et les **Reliques** (des mécaniques, pas des %). Arbre de talents avec **voies exclusives**. |
| **Cookie Clicker** | Cookie doré (récompense en *secondes de production*), succès qui alimentent un multiplicateur (le lait), saisons, événements à l’écran. | Raisons de regarder l’écran ; des succès qui comptent. | Déjà : cristal doré, météores en secondes de production. Ajout : succès à paliers avec récompense réelle, **cycle jour/nuit**, événements variés (faille, marchand). |
| **NGU Idle** | Beaucoup de systèmes parallèles qui consomment des ressources différentes, défis de « renaissance », allocation de ressources limitées. | Toujours une décision à prendre ; profondeur. | Ressource nouvelle (**fragments de rune**) avec ses propres puits (fusion, œufs). Choix d’allocation : un familier **perché** (frappe) ou **en expédition** (butin). |
| **Melvor Idle** | Actions hors-ligne qui reviennent avec du butin, familiers rares, *maîtrise* qui récompense la répétition. | Le jeu travaille quand on n’est pas là, et on a hâte de revenir. | **Expéditions** de familiers (10 min à 8 h, fonctionnent hors-ligne). **Familiers** avec rareté et niveaux. |
| **Idle Slayer** | Combats actifs courts et intenses au milieu d’un jeu idle, coffres, arbre d’ascension, mode « rage ». | Des pics d’action dans un rythme lent. | **Gardiens de cristal** : un golem à abattre à la pioche en temps limité, avec une onde de choc à sauter. |
| **Incrémentaux à runes (Roblox)** | Tirage avec chance, auto-tirage, index, **fusion** de doublons, **compteur de pitié**, **bonus de chance la nuit / pendant les événements**, sets. | Chasse à long terme, chaque doublon a une utilité. | **Fusion** (5 doublons + fragments → rareté supérieure), **sets**, **pitié** légère, **autel de Lune** actif la nuit, mythiques à effet unique. |

Principes que j’en tire :
1. **Une nouveauté toutes les 3 à 8 minutes** pendant la première île, puis une nouvelle *couche* à chaque palier de prestige.
2. **Chaque système produit ou consomme quelque chose que les autres utilisent.** Aucun système isolé.
3. **Les récompenses s’expriment en relatif** (secondes de production, % de la valeur d’un coup) pour rester utiles du début à la fin sans exploser.
4. **Un multiplicateur nouveau = un plafond ou un rendement décroissant.** Les systèmes se multiplient entre eux (runes × succès × talents × familiers × graines) : c’est là que les incrémentaux cassent.

---

## 2. La frise de progression

Temps indiqués pour un joueur moyen (profil « moyen » du bot). Les objectifs du tutoriel et les annonces présentent chaque nouveauté au moment où elle apparaît.

### Début de partie — première île, 0 à 15 min : « apprendre l’île »
| Moment | Débloqué | Pourquoi on continue |
|---|---|---|
| 0:00 | Cristal, pioche, foreuses, Atelier | Le geste de base, chaque achat se voit dans le monde. |
| ~1:30 | Excavatrice, Autel de Pierre (runes) | Premier tirage : le frisson de la rareté. |
| ~2:20 | Pont des Forges, raffinerie, Lumen, Autel de Braise | Nouvelle île, nouvelle ressource. |
| ~3:00 | Cristal doré, pluies de météores | Raisons de bouger dans le monde. |
| **~6:00** | **Première nuit** (cycle de 8 min : 6 min de jour, 2 min de nuit) | Le ciel change, les cristaux brillent, la chance des runes monte de 50 %. L’**Autel de Lune** s’allume : ses runes ne se tirent que la nuit. |
| **~9:00** | **Premier Gardien de cristal** (Forges ouvertes requises) | Un pic d’action. Il lâche des **fragments de rune**, une nouvelle ressource. |
| **~10:00** | **Creuset runique** (fusion) | Les doublons inutiles deviennent une rune de rareté supérieure. Les **sets** apparaissent dans l’index. |
| ~14:30 | Pont des Brumes, geysers, Autel de Brume | Production massive. |

### Milieu de partie — première île, 15 à 40 min : « l’île tourne toute seule »
| Moment | Débloqué | Pourquoi on continue |
|---|---|---|
| **~15:00** | **Nid d’éther, premier familier** (récompense d’objectif) | La récompense classique de mi-partie : un petit être qui **frappe le cristal à ta place**. On le voit voler. Les œufs suivants s’achètent en Lumen ou tombent des gardiens. |
| ~22:00 | Escalier céleste, prismes, Autel d’Astre, Phare | Le but final de l’île devient visible. |
| ~30–40:00 | Phare éveillé, **premier prestige** | Graines d’étoile, nouvelle saison. |

### Fin de partie — îles 2 à ~8 (environ 40 min à 4 h) : « choisir son style »
| Moment | Débloqué | Pourquoi on continue |
|---|---|---|
| Prestige 1 | **Jardin d’étoiles** (arbre de talents payé en graines), Constellations | On *plante* ses graines : trois branches (Mineur, Machiniste, Mystique) et une **voie exclusive** au bout de chacune. |
| Prestige 1 | **Quai des dirigeables : expéditions** | Envoyer un familier 10 min à 8 h. Parfait avant de fermer le jeu. |
| Prestige 1 | **Faille d’éther** et **marchand ambulant** rejoignent les événements | Variété ; le marchand vend œufs, fragments et runes contre du Lumen. |
| Prestige 2 | Talent « Contremaître » : **achat automatique** des machines | Automatisation : on joue au niveau des décisions, plus des clics. |
| Prestige 3+ | Paliers plus profonds de l’arbre, constellations 4 à 7 | Chaque île va plus vite, le Phare demande ×8. |

### Après le prestige — l’Ascension (≈ 2,5 à 5,5 h de jeu actif + idle)
| Moment | Débloqué | Pourquoi on continue |
|---|---|---|
| 1 000 graines gagnées dans le cycle | **Ascension** au Phare : l’archipel monte au-dessus des nuages | Remise à zéro des graines, talents et constellations. Gain : des **Couronnes d’éther**. |
| Ascension 1 | **Défis** | Des îles à contrainte (« sans foreuses », « production ÷10 »…) qui donnent des **bonus permanents**. |
| Ascension 1 | **Reliques** (payées en couronnes) | Des **mécaniques** : ponts déjà construits, Phare automatique, perchoir de familier supplémentaire, héritage de machines. |
| Ascensions suivantes | Défis plus durs, reliques restantes, index des runes célestes | La chasse à long terme. |

---

## 3. Nouvelles fonctionnalités, par priorité

Ressources : **éclats** (cyan), **Lumen** (or), **graines** (violet), et une nouvelle, **fragments de rune** (encre rose `#b8406a`). Les fragments sont la monnaie des runes, distincte de la production. Sans ça, la fusion concurrencerait directement les machines et serait toujours ou jamais rentable.

### P0 — Succès v2 (obligatoire)
- **62 succès** en 6 catégories (récolte, machines, runes, prestige, exploration, secrets), presque tous à **3 paliers** (bronze, argent, or), soit 163 paliers à débloquer.
- **Récompense à chaque palier**, petite mais réelle : +1 à 3 % de production, de valeur de coup, de chance, de Lumen, de fragments… Les bonus passent par `bonusTotals()` et ses plafonds (`STAT_CAP`).
- **10 succès cachés** (affichés « ??? » jusqu’au déblocage), dont 7 dans la catégorie Secrets, basés sur des gestes du joueur : prestige la nuit, sauts en rafale, rester à contempler la nuit, etc.
- **Page dédiée** (le Journal, onglet *Succès*) : filtres par catégorie, barre de progression vers le palier suivant, médaille bronze/argent/or, total des récompenses.
- *Économie* : consomme rien, produit des multiplicateurs permanents (conservés au prestige et à l’Ascension). Nouveaux compteurs dans `GameState.counters`.
- *Sauvegarde* : v3. Les 32 succès v2 sont convertis vers les paliers équivalents.

### P0 — Runes étendues (obligatoire)
- **2 nouvelles familles** :
  - **Lune** : autel sur l’Île Mère, **utilisable seulement la nuit**. Chance, hors-ligne, production.
  - **Gardien** : pas d’autel. Ces runes **tombent des Gardiens de cristal**. Valeur des coups, critiques, fragments.
- **Fusion** au **Creuset runique** (objet physique près du Nexus) : **5 copies d’une rune + des fragments → 1 copie de la rareté supérieure** de la même famille. Jusqu’à légendaire (mythique et céleste restent une chasse). Coût en fragments croissant par rareté.
- **Bonus de set** : 8 combinaisons, par exemple « Quatre éléments » (une rune rare+ de Pierre, Braise, Brume et Astre → +10 % de production) ou « Marées » (les trois runes de Brume rare/épique/légendaire → +40 % hors-ligne). Affichées dans l’index avec ce qui manque.
- **Mythiques à effet unique** :
  - *Écho de la montagne* (Pierre) : chaque coup de pioche est **répété** une demi-seconde plus tard à 50 % (on voit un second impact) ;
  - *Phénix* (Braise) : un coup critique **embrase** la pioche, et les 3 coups suivants sont critiques ;
  - *Éclipse* (Lune) : **la nuit dure deux fois plus longtemps**.
- **Pitié légère** : après 100 tirages sans rune épique (ou mieux), la suivante est **garantie épique**. Après 1 000 tirages sans légendaire, **garantie légendaire**. Compteurs visibles dans l’autel.
- *Économie* : les runes consomment éclats/Lumen (tirage) et fragments (fusion) ; elles produisent des multiplicateurs plafonnés.

### P1 — Cycle jour/nuit
- 8 min de jeu : 6 min de jour, 2 min de nuit (aube et crépuscule en transition).
- La nuit : **chance des runes ×1,5**, cristaux et veines qui brillent, étoiles et aurores, **Autel de Lune** actif, gardiens un peu plus fréquents.
- La production ne dépend **pas** de l’heure : le calcul hors-ligne reste exact.
- Annonce à la première nuit ; un petit cadran soleil/lune dans le HUD indique le temps avant la nuit.

### P1 — Gardiens de cristal
- Après l’ouverture des Forges, un **golem de cristal** surgit près du joueur toutes les 4 à 7 min (×1,3 plus souvent la nuit).
- **Combat à la pioche** : 30 points de vie, 35 s. Tous les 8 coups reçus, il **frappe le sol** et une onde de choc part. Il faut **sauter** pour l’éviter, sinon on est étourdi 1,2 s.
- **Butin** : fragments (8 + 2 par prestige), 2 à 4 **runes de Gardien** (tirées avec la chance actuelle), 45 s de production, et 10 % de chance d’un **œuf de familier**.
- Le premier gardien est annoncé par un objectif ; le combat a sa barre de vie dans le monde et son compteur de temps.

### P1 — Familiers d’éther (automatisation de la frappe)
- Débloqués à l’ouverture de l’Îlot des Geysers : le **Nid d’éther** y apparaît, et l’objectif « Fais éclore ton premier œuf » offre le premier.
- Chaque familier a une **espèce** (4), une **rareté** (commun → légendaire) et un **niveau** (payé en Lumen). Il **frappe le cristal** toutes les 2 s pour une fraction de la valeur d’un coup (de 25 % pour un commun à 100 % pour un légendaire, +8 % par niveau).
- **3 perchoirs** au départ (plus avec talents et reliques). On les voit voler autour du cristal et piquer dessus.
- Œufs : Lumen (prix croissant), gardiens, expéditions, marchand. Les familiers et leurs niveaux **survivent au prestige** (ce sont des compagnons) ; leur puissance est relative à la valeur d’un coup, donc elle ne s’emballe pas.

### P1 — Arbre de talents : le Jardin d’étoiles
- Débloqué au premier prestige, ouvert depuis le Phare.
- **On plante ses graines** : une graine plantée dans un talent **continue de compter** pour le bonus de production (+5 %). Les graines servent donc de budget, pas de sacrifice. Réinitialisation gratuite à chaque descente.
- 3 branches de 5 talents (dont certains à plusieurs niveaux) :
  - **Mineur** (jeu actif) : valeur des coups, **combo** (la série de frappe multiplie les coups), critiques, temps contre les gardiens.
  - **Machiniste** (idle) : **Contremaître** (achat automatique), plafond hors-ligne de 8 h à 12 h, machines de départ, réduction de coût.
  - **Mystique** (runes) : chance, fusion moins chère, pitié plus rapide, budget d’auto-tirage de 10 à 15 %.
- **Voies exclusives** : le dernier talent de chaque branche est une *voie*, et on n’en choisit **qu’une** :
  - *Voie de la Pioche* : les coups rapportent ×2 et chaque série de 25 libère une onde d’éclats ;
  - *Voie de l’Automate* : un perchoir de plus et des familiers ×1,5 ;
  - *Voie de l’Oracle* : la nuit occupe la moitié du cycle.

### P2 — Expéditions
- **Quai des dirigeables** sur l’Île Mère, débloqué au premier prestige.
- On envoie un **familier** (qui quitte son perchoir : un vrai choix) pour 10 min, 1 h, 4 h ou 8 h. Le butin dépend de la durée, de la rareté et du niveau : éclats (en secondes de production), Lumen, fragments, œufs, runes. Fonctionne **hors-ligne**.
- Le dirigeable part et revient physiquement du quai.

### P2 — Événements variés
- **Faille d’éther** (prestige 1+) : une déchirure violette s’ouvre ; frappe-la 3 fois pour la refermer et obtenir **×3 de production pendant 45 s** (« Afflux »).
- **Marchand ambulant** (prestige 1+) : une petite montgolfière se pose 2 min. Il vend œufs, fragments et un tirage garanti rare+, contre du Lumen.

### P2 — Ascension, Défis et Reliques
- **Ascension** : à 1 000 graines gagnées pendant le cycle en cours (mesuré dans BALANCE.md : 2,4 à 5,5 h selon le profil). Remise à zéro des graines, des talents, des constellations, des runes non mythiques et des niveaux d’autel. On garde les succès, les familiers, les mythiques et célestes, les couronnes et les reliques.
- **Couronnes d’éther** = ⌊3 × √(graines du cycle / 1 000)⌋. Chacune donne **+10 % de production et +10 % de chance de rune**, et elles achètent des reliques.
- **Reliques** (mécaniques) : *Mémoire des ponts* (ponts déjà construits), *Phare automatique* (descend tout seul quand le gain double tes graines), *Perchoir d’or* (+1 familier), *Héritage* (on démarre avec 10 % des machines de l’île précédente), *Carillon du marchand* (le marchand revient deux fois plus souvent).
- **Défis** : une île à contrainte, terminée en éveillant un Phare à seuil réduit. Exemples : sans foreuses (récompense : foreuses ×3), production ÷10 (+25 % de production), autels scellés (+50 % de chance), nuit éternelle sans lumière (+100 % de fragments), coûts ×3 (−10 % de coûts).

### P1 — Écran de statistiques
- Une page complète dans le Journal : temps, ressources, frappes, runes par rareté, gardiens, familiers, expéditions, nuits, distance, records (meilleur coup, plus longue série, île la plus rapide).

---

## 4. Ce que je ne fais pas, et pourquoi

- **Une 5e île physique et une 6e machine.** Ça demanderait de refaire la disposition, les ponts, les convoyeurs et l’équilibrage de toute la première île, pour un gain faible face aux systèmes ci-dessus. L’Ascension change déjà le monde (ciel, reliques).
- **Placement libre des machines, gestion des convoyeurs.** Déjà écarté à l’itération 1 : friction sans décision intéressante.
- **Des nombres de rareté au-delà de « céleste »** et une monnaie premium. Pas de pression d’achat ; la chasse céleste suffit.
- **Les défis avant l’Ascension.** Les placer plus tôt doublerait les choses à apprendre pendant la première heure. Comme dans les jeux qui marchent, ils deviennent la mécanique de la seconde couche.
- **Des quêtes quotidiennes et des connexions récompensées.** Elles punissent l’absence, à l’opposé de l’esprit idle du jeu (le hors-ligne est récompensé, pas puni).
- **Un vrai combat avec équipement.** Le gardien reste un mini-jeu de pioche de 30 s : il doit s’intégrer au jeu, pas en devenir un autre.

---

## 5. Garde-fous d’équilibrage (détails dans BALANCE.md)

- Tous les bonus passent par **un seul point** (`bonusTotals`) et ses plafonds : plafonds propres aux runes qui grandissent avec les îles reliées (`RUNE_CAP`), plafonds durs (coûts −60 %, critique 50 %, vitesse +150 %, hors-ligne +200 %, graines +100 %) et plafonds doux au-delà desquels un bonus ne croît plus qu’en x^0,4 (`SOFT_CAP`).
- Les familiers et les gardiens sont en **relatif** (valeur d’un coup, secondes de production).
- Les fragments n’existent que par les gardiens, les expéditions et le marchand : la fusion ne peut pas tourner en boucle.
- Le bot de simulation joue **tous** les systèmes, avec 5 profils (actif optimal, moyen, idle, chanceux, aléatoire), sur une campagne complète jusqu’à l’Ascension. Les cibles sont des tests automatiques.
