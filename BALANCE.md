# BALANCE — passe d’équilibrage globale (itération 3)

Chaque système a d’abord été équilibré seul. Mais les multiplicateurs se **multiplient entre eux** (runes × succès × talents × familiers × graines × couronnes) : c’est là qu’un incrémental casse. Cette passe a donc rejoué une **campagne complète**, de la première île jusqu’à l’Ascension, avec cinq profils de joueur. Toutes les cibles ci-dessous sont devenues des **tests automatiques** (`tests/balance.test.ts`, `src/economy/balanceTargets.ts`) qui bloquent le déploiement.

```bash
npm run simulate              # rapport complet (≈ 50 s), code de sortie ≠ 0 si une cible est ratée
npm run simulate -- --verbose # détail île par île : temps, graines, bonus, chance, blocage
```

## 1. Méthode

Le bot (`src/economy/simulation.ts`) joue tous les systèmes :
- il frappe, achète l’option au meilleur temps de retour et tire des runes par espérance de gain ;
- il fusionne au Creuset, combat les gardiens, achète et monte les familiers, les envoie en expédition ;
- il plante des talents (priorités « actives » ou « idle » selon le profil), referme les failles et achète au marchand ;
- il ramasse une part des événements selon le profil.

La campagne (`src/economy/campaign.ts`) enchaîne les îles :
- le joueur attend que le Phare s’éveille, puis joue encore 15 à 40 % de ce temps (selon le profil) pour gagner plus de graines, et fait descendre l’île ;
- elle s’arrête dès que l’Ascension est possible, ou après 9 h de jeu simulé.

### Les cinq profils

| Profil | Définition |
|---|---|
| **Actif optimal** | 3 coups/s en permanence, décisions instantanées, ne marche jamais, attrape 95 % des événements. Borne basse : aucun humain ne joue comme ça. |
| **Moyen** | 2 coups/s pendant les 10 premières minutes de chaque île, puis laisse tourner. Attrape 75 % des événements. |
| **Surtout idle** | 1 coup/s pendant 3 minutes par île, 30 % des événements. |
| **Chanceux** | Le profil moyen, avec des **tirages favorables forcés** : chaque tirage `u` devient `u^1,5` (runes, butin des gardiens, œufs, expéditions). Une rareté « 1 sur N » sort environ `N^(1/3)` fois plus souvent : légendaires ×10, célestes ×100. C’est le joueur le plus chanceux plausible. Voir § 4 pour le profil `u³`, encore plus extrême. |
| **Ne lit rien** | Achète au hasard tout ce qui est abordable (ponts compris), 1,5 coup/s pendant 5 minutes, 50 % des événements. |

## 2. Résultats mesurés (après la passe)

| Profil | 1er prestige | 2e île | Île la plus courte | Ascension | Blocage max |
|---|---|---|---|---|---|
| Actif optimal | 27 min 25 s | 9 min 41 s | 6 min 30 s | 2,40 h (9 îles) | 6 s |
| Moyen | 37 min 15 s | 17 min 50 s | 7 min 15 s | 5,53 h (9 îles) | 17 s |
| Surtout idle | 42 min 11 s | 22 min 15 s | 12 min 15 s | 4,68 h (8 îles) | 13 s |
| Chanceux | 26 min 03 s | 4 min 56 s | 4 min 56 s | 3,69 h (9 îles) | 13 s |
| Ne lit rien | 1 h 10 min | 25 min 53 s | 13 min 39 s | 5,59 h (8 îles) | 4 min 59 s |

« Blocage max » mesure la plus longue période où **rien** n’est achetable (machines, améliorations, ponts, œufs, niveaux de familiers ; les tirages de runes ne comptent pas). L’ancienne métrique, le « temps entre deux achats », mesurait surtout le bot qui *choisit* d’économiser pour une meilleure amélioration (jusqu’à 6 min) alors que des achats étaient possibles. Le profil « ne lit rien » se ruine en achats au hasard, d’où ses 5 min : la cible ne s’applique pas à lui.

Le temps de l’idle ne compte pas ses gains hors-ligne : en vrai, ses heures « fermé » le rapprochent encore de l’Ascension.

### Cibles vérifiées automatiquement

| Cible | Seuil | Profils |
|---|---|---|
| 1er prestige | jamais avant 25 min | tous |
| 1er prestige | entre 30 et 45 min | moyen, idle |
| 1er prestige | moins de 2 h | « ne lit rien » |
| Ascension | jamais avant 2 h | tous |
| Ascension | atteinte en moins de 9 h | tous sauf « ne lit rien » |
| Ascension | 6 h au plus | moyen, idle |
| Aucune île bâclée | chaque île ≥ 3 min | tous |
| Blocage | ≤ ~2 min (130 s) | tous sauf « ne lit rien » |
| Emballement des bonus | production ≤ +1 200 % en fin de cycle | tous |
| Multiplicateur de prestige | au plus ×6,5 d’une île à la suivante | tous |
| 2e île | < 70 % du temps de la 1re | moyen |
| Les runes comptent | 1re île ×1,1 à ×2,2 plus rapide avec les runes | moyen |
| Garde-fous | toutes les runes ×1 000 restent sous les plafonds ; les plafonds sont monotones | tests unitaires |

## 3. Les emballements trouvés, et ce que j’ai fait

### 3.1 La boucle graines → chance → runes → production → graines (la grosse)
**Mesuré** avant correction (profil moyen) : deuxième île en 2,3 min, onzième en 0,7 min, 77 000 graines en 2 h.
- Bonus de production des runes et succès : **+17 800 %** à la 14e île.
- Chance : **+594 000 %**.

**Cause.** Chaque graine donnait +2 % de chance de rune, sans limite. Les graines faisaient sortir des runes célestes (+200 à +600 % de production par copie), qui faisaient pousser plus vite les îles suivantes, et donc rapportaient plus de graines.

**Corrections.**
- **Chance des graines logarithmique** : ×(1 + 0,5 × log₂(1 + graines/25)). Par exemple 100 graines → ×2,2, et 10 000 → ×5,3, au lieu de ×201.
- **Plafonds doux** sur le total de chaque bonus (`SOFT_CAP`, appliqués dans `bonusTotals`, l’unique point où tous les bonus se rencontrent) : au-delà du seuil k, le bonus ne croît plus qu’en k × (x/k)^0,4.

  | Bonus | Seuil |
  |---|---|
  | Production | +800 % |
  | Chance | +600 % |
  | Valeur des coups | +800 % |
  | Lumen | +600 % |
  | Fragments | +300 % |
  | Familiers | +200 % |

  Les seuils sont hauts exprès : ce sont des **filets de sécurité**. Avec un plafond doux à +400 %, tout le monde l’atteignait dès la 1re île, et les succès ou talents de fin de partie ne servaient plus à rien.
- **Bonus des graines adouci** au-delà de 100 graines : la production compte `100 × (graines/100)^0,8` graines effectives. Le bonus de +5 % par graine reste exact pour les premières îles.

### 3.2 La chance précoce qui saute toute la première île (profil chanceux)
**Mesuré** avec le premier modèle chanceux (`u³`) : premier prestige en **6 min 24 s**, Ascension en 1,25 h.

**Causes**, isolées une par une (`noRunes`, `noPets`, comparaison des bonus à 4 min et à 10 min) :
1. La rune mythique *Grand Courant* donne +1 rune par tirage **par copie**, sans plafond : 12 runes par tirage dès la 10e minute, puis une avalanche.
2. Les runes de Braise donnaient −60 % de coût et 50 % de critiques dès l’ouverture des Forges.
3. Dès la 4e minute, ×3 sur les coups et ×2 sur la production. La croissance étant exponentielle, ce petit avantage précoce devient énorme.

**Corrections.**
- **Plafonds propres aux runes** (`RUNE_CAP`), en plus des plafonds globaux :

  | Effet | Plafond des runes |
  |---|---|
  | Production | +300 % |
  | Valeur des coups | +400 % |
  | Lumen | +300 % |
  | Chance | +250 % |
  | Fragments | +200 % |
  | Coûts | −40 % |
  | Critique | 30 % |
  | Vitesse | +100 % |
  | Runes par tirage | +2 |
- **Les runes « résonnent » avec les îles reliées** : leurs plafonds valent 10 % sur l’Île Mère seule, 25 % avec les Forges, 55 % avec les Geysers et 100 % avec l’Île Céleste. Même une avalanche de célestes ne peut plus sauter le début de partie, et chaque pont rend les runes plus fortes (une raison de plus de les construire).
- **Profil chanceux redéfini** de `u³` à `u^1,5`. Avec `u³`, une céleste « 1 sur 1 million » sortait 1 fois sur 80 : aucun joueur ne vivra ça. `u^1,5`, c’est déjà légendaires ×10 et célestes ×100.

  Résultat : premier prestige à 26 min (contre 37 min pour le même joueur avec une chance normale), et Ascension à 3,7 h.

### 3.3 Des îles en dents de scie
Les Constellations ×2 (100 graines) et ×3 (600 graines) faisaient alterner des îles de 5 min et de 50 min.
- Elles passent à **×1,5** et **×2**.
- Le seuil du Phare a été revu : 1,8e10 pour la 1re île, ×20 pour la 2e (la première descente apporte d’un coup beaucoup de gains permanents : graines, runes légendaires, familiers, talents, constellations), puis **×2,9 par île** au lieu de ×8.
- Le diviseur des graines suit le seuil (√ du rapport des seuils) : chaque île rapporte nettement plus que la précédente.

### 3.4 Les familiers et l’écart actif / idle
Les familiers frappent pour 25 à 100 % d’un coup toutes les 1,6 à 2 s (+6 % par niveau, niveau 25 au plus, 3 perchoirs). Leur puissance est **relative à la valeur d’un coup**, et cette valeur est elle-même calculée avant le revenu des familiers. Il n’y a donc pas de boucle.

Ils réduisent l’écart structurel entre un joueur actif et un joueur idle : 1re île à 42 min pour l’idle contre 37 min pour le moyen (l’écart était de 4 min avant les familiers, il l’est resté malgré tous les nouveaux systèmes actifs).

### 3.5 Temps passé dans l’Ascension
Cible : « quelques heures, jamais avant plusieurs heures ». Le seuil est de **1 000 graines gagnées dans le cycle**, au lieu des 2 500 prévues dans DESIGN.md (mesuré avant la correction de la courbe).
- À 900 graines, l’optimal montait en 1,97 h, sous la barre des 2 h.
- À 1 000 graines : 2,4 h (optimal), 3,7 h (chanceux), 4,7 h (idle), 5,5 h (moyen).

### 3.6 Bug trouvé grâce aux tests d’emballement
Le cache de `bonusTotals` ignorait le nombre d’îles reliées : le plafond des runes ne se mettait pas à jour à l’ouverture d’un pont. La clé de cache contient maintenant les îles, la couronne et le défi en cours.

## 4. Ce qui reste volontairement fort

- **Les runes accélèrent la 1re île d’un facteur 2** (ancienne cible ×1,08 à ×1,8). Avec deux nouvelles familles, les sets, la fusion et le butin des gardiens, les runes sont devenues le système central de la première île. La cible est passée à **×1,1 à ×2,2**. Sans runes, la 1re île prend environ 75 min : elles comptent, sans qu’il y ait de raccourci.
- **Le profil `u³`** (célestes 1 fois sur 80) fait toujours la 1re île en environ 10 min. C’est assumé et documenté : ce profil n’existe pas dans la réalité. Le profil chanceux testé, `u^1,5`, est déjà au-delà du 99,9e centile.
- **La 2e île du chanceux** prend 5 min, au-dessus de la cible de 3 min. La chance accumulée pendant la 1re île (runes légendaires conservées) est la récompense de cette chance.

## 5. Garder l’équilibre

1. Les chiffres sont dans `src/config/*` uniquement.
2. Après tout changement qui touche l’économie : `npm run simulate`. La CI le relance, et `npm test` contient les mêmes cibles.
3. Si une cible casse, chercher la cause comme ci-dessus (lancer un profil avec `noRunes`/`noPets`, comparer `bonusTotals` à 4 min et à 10 min) plutôt que de déplacer la cible.
