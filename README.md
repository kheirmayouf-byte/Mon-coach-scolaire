## Version 3.4.7 - supports reliés et ressources dans les exercices

Documents partagés entre devoirs du même enfant, bibliothèque de révision, entraînements à partir de supports, récupération élargie des pièces jointes du cahier de texte, lecteurs audio/vidéo et planning allégé. Voir [les changements et limites](docs/V3.4.7.md).

## Version 3.4.6 - photos : réduction des caractères parasites

Le contraste local réduit les ombres et le texte du verso. La transcription écarte les petits caractères isolés dans les marges et signale les mots incertains. Voir [les vérifications et limites](docs/V3.4.6.md).

## Version 3.4.5 — lecture automatique des documents

Photos et PDF scannés sont transcrits sur l’appareil, sans connexion IA. Les documents existants peuvent être relus puis validés sans copier-coller. Voir [le fonctionnement et les vérifications](docs/V3.4.5.md).

## Version 3.4.4 — planning finalisé

Validation directe, consigne dépliable et cartes lisibles sur ordinateur et téléphone. Les quatre actions restent accessibles dans chaque carte. Voir [les changements et vérifications](docs/V3.4.4.md).

## Version 3.4.3 — autorisations du relais limitées à une demande

Le site se connecte au même abonnement ChatGPT via le relais local Windows. La session parent reste côté Supabase ; seules des preuves signées, brèves et liées à chaque demande circulent vers le relais. Voir [le parcours et ses limites](docs/V3.4.3.md).

## Version 3.4.2 — connexion IA dans le site

Le site peut utiliser l’abonnement ChatGPT par le relais Windows du même ordinateur. Le client Windows doit rester ouvert. Le site fournit les boutons Continuer avec ChatGPT, Tester la connexion et le modèle du compte. Voir [le fonctionnement et les vérifications](docs/V3.4.2.md).

## Correctif 3.4.1

Le panneau Mon IA ne présente plus de sélecteur sans action. Le site propose le téléchargement Windows et les étapes de connexion. Dans le client Windows, le bouton Continuer avec ChatGPT lance la connexion existante. Le site hébergé ne reprend pas l’abonnement ChatGPT du client local.

## Mise à jour 3.4.0

Parcours de connexion, documents, sessions, emploi du temps et chat améliorés. Voir [les changements et limites vérifiés](docs/V3.4.md).

# Mon Coach Scolaire

Application familiale sur GitHub Pages, avec données et documents privés dans Supabase et connecteur ÉcoleDirecte côté serveur.

## Version 3.0

- Agenda filtrable, devoirs compacts, chronomètre, indicateurs de charge et de progression, profils pédagogiques et supports privés : voir [la livraison V3 et ses limites](docs/V3.md).
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

Les profils enfants restent des vues accompagnées du compte parent. Les contenus des projets Mr Prof ne sont pas automatiquement importés. La version ordinateur 3.3.0 prépare la connexion officielle à l’abonnement ChatGPT, avec test réel à effectuer sur le poste du parent : voir [le guide ordinateur](docs/chatgpt-desktop.md). Le moteur API du site hébergé reste désactivé ; aucun achat de crédits n’a été effectué. Les quiz locaux utilisent les fiches et définitions des documents vérifiés. Les photos/scans nécessitent un texte ajouté ou vérifié ; les PDF textuels sont extraits localement. Pas de notification téléphone en arrière-plan. Voir [V3](docs/V3.md) pour les autres périmètres.
