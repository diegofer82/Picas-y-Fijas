# Livraison par défaut

À la demande de l'utilisateur, chaque modification finalisée doit être commitée,
poussée sur `main` et déployée en production, sauf indication contraire
expresse. Avant la livraison, exécuter les vérifications pertinentes et laisser
la branche `main` propre.

## Pendant le plan « El camino a la 4.0.0 »

Le plan vit dans `README.md`, section « El camino a la 4.0.0 ». La règle
ci-dessus s'applique **à chaque tâche**, pas à chaque étape : dès qu'une tâche
est terminée, elle est commitée, poussée et déployée en production. On n'attend
pas la fin de l'étape et on n'empile pas deux tâches dans un même commit.

Les seules tâches qui se livrent ensemble sont celles que le plan déclare
enchaînées — l'une ne tient pas debout sans l'autre, ou la première ne change
rien de visible pour le joueur. Dans ce cas, la livraison a lieu au bout de la
dernière tâche requise, en une seule fois.

Si la tâche apporte une migration, `npm run db:remote` passe **avant** le push.
Après chaque livraison, `main` est propre : rien de non commité, aucun fichier
généré laissé à moitié.
