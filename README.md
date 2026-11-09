# Mon Coach Scolaire

Application familiale statique, utilisable sur GitHub Pages sans serveur applicatif.

## Version 2.3

- Import ÉcoleDirecte non officiel depuis le compte parent : authentification avec question de sécurité ou TOTP, association manuelle élève/profil, aperçu et import atomique des nouveaux devoirs, sans doublons. Voir [le guide](docs/ECOLEDIRECTE.md).
- Mode local conservé, reprise des devoirs de la version initiale sans effacer la clé historique.
- Profils personnalisables sur l’appareil ou dans la base privée. Aucun prénom réel n’est livré dans cette version.
- Devoirs avec durée, échéance, validation de dates et import texte atomique.
- Planning par enfant synchronisé : créneaux par jour, lundi alterné, mode vacances manuel, séances de 25 min maximum et pauses de 5 min comprises dans le budget.
- Modification des consignes et estimations, repérage des contrôles et des consignes manquantes.
- QCM d’entraînement généraux en conjugaison, électricité et anglais, corrigés localement. Ces exercices ne prétendent pas reproduire une page de manuel.
- Fiches de révision espacée (1, 3, 7, 14, 30 jours).
- Connexion parent Supabase et création du compte réservée aux emails préalablement autorisés, avec confirmation d’email.
- Synchronisation à la connexion, après chaque écriture, au retour sur l’onglet et toutes les 30 secondes tant qu’il est visible.
- Contrôle de version contre les écrasements entre appareils ; pas de file d’attente hors ligne cachée.
- Export JSON privé. Les données cloud ne sont pas mises dans le cache local applicatif.

Les espaces enfants sont des vues du compte parent. Ils ne constituent pas des comptes enfants ni une restriction d’accès entre sœurs. Utilisation accompagnée sur un appareil autorisé.

## Développement

Node 24 ou supérieur :

```sh
npm ci
npm test
npm run build
python -m http.server 8765
```

`app.js` est le bundle publié, sans dépendance CDN. Le fichier de verrouillage fixe les dépendances. Les tests utilisent Node, jsdom et PostgreSQL embarqué PGlite (RLS réelle, contexte Auth simulé). Cela ne remplace pas les tests de la configuration Supabase hébergée.

## Activation Supabase

Lire [le guide](docs/SUPABASE.md). La migration fournie crée des tables `mcs_*` isolées ; les corrections suivantes ferment l’accès navigateur aux anciennes tables tout en les conservant pour l’administration.

Le projet hébergé a été audité et les corrections appliquées le 9 novembre 2026. Le raccordement public est automatique ; la première connexion attend la désignation et la création du compte parent autorisé. Les profils sont préparés dans la base privée. Voir le guide pour les tests effectués et ceux restant à exécuter avec un vrai compte.

## Publication et retour arrière

GitHub Pages sert les fichiers à la racine de `main`. Le bundle est versionné pour conserver ce mode de publication. Le workflow CI exécute les tests et vérifie que le bundle correspond aux sources.

La branche `backup/pre-v2-2026-11-09` conserve la version initiale. Un retour arrière passe par un commit qui rétablit les fichiers de cette branche, sans réécrire l’historique. Ne pas réinjecter de données familiales dans Git.

## Limites

Les créneaux sont saisis par le parent ; le planning ne récupère pas automatiquement les emplois du temps scolaires ni les vacances. Le mode vacances s’active manuellement. Il ne réserve pas d’heures fixes. Pas encore d’OCR, de traitement des photos dans l’application, d’IA externe, de notification, de synchronisation ÉcoleDirecte automatique ou de compte enfant indépendant. Les anciens scores du mini-quiz restent dans le stockage historique, conservé intact ; les nouvelles révisions utilisent des fiches saisies par la famille.
