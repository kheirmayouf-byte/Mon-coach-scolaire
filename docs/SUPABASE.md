# Supabase : état du raccordement

## Audit effectué le 9 novembre 2026

Le projet hébergé a été inspecté avant modification : cinq tables initiales, toutes vides, RLS activée, aucun compte Auth et aucun bucket Storage. Trois fonctions SECURITY DEFINER étaient exécutables depuis les rôles clients et les tables disposaient de grants trop larges.

Corrections appliquées :

- Anciennes tables conservées, accès API navigateur révoqué. Elles restent consultables par l’administration ; aucune donnée initiale n’a été supprimée.
- Exécution des anciennes fonctions privilégiées révoquée aux rôles PUBLIC, anon et authenticated.
- Tables `mcs_*` installées : isolation par foyer, memberships administratifs, clés étrangères composites, droits de modification limités et contrôle de version.
- Index manquants sur les clés étrangères ajoutés.
- Liste privée d’emails parents autorisés, inaccessible aux clients. Les créations Auth non autorisées sont bloquées par un trigger. Le rattachement au foyer intervient uniquement après confirmation de l’email autorisé.
- Deux profils créés dans la base privée ; aucun prénom réel ni identifiant de foyer n’est enregistré dans le dépôt.

Les alertes initiales de fonctions privilégiées accessibles aux clients ont été corrigées. Le signal INFO « RLS sans policy » de la liste privée est volontaire : aucune policy et aucun grant client permettent d’y accéder. Les index neufs peuvent être signalés comme inutilisés tant que l’application n’a pas d’activité.

## Configuration de l’application

`src/public-config.js` contient uniquement l’URL API et une clé **publishable**, destinées au navigateur. Ni service_role, ni secret Auth, ni mot de passe, ni email privé. La configuration est chargée automatiquement. Les paramètres avancés restent disponibles pour changer de projet sur un appareil.

La connexion parent est opérationnelle. Les autorisations individuelles sont administrées exclusivement dans la base privée ; leurs emails, UUID et états ne sont pas consignés dans le dépôt.

## Première connexion d’un parent

1. Le propriétaire indique explicitement l’email à autoriser. L’administration l’inscrit dans `mcs_private.approved_parents` avec le foyer privé existant. Ne jamais versionner cette opération avec un email ou un UUID réel.
2. Le parent ouvre l’application, Parents & connexion → Première connexion : créer mon compte parent, puis saisit lui-même son email et son mot de passe (12 caractères minimum).
3. Il confirme l’email envoyé par Supabase. Si la redirection de confirmation n’est pas encore autorisée dans Auth, il rouvre simplement l’application après confirmation. Pour un parcours fluide, l’administrateur peut régler Site URL et Redirect URLs sur l’URL GitHub Pages de l’application.
4. Le parent se connecte. Le trigger le rattache automatiquement au foyer après confirmation. Aucun rattachement n’est choisi depuis le navigateur ou via des métadonnées utilisateur.

Les paramètres globaux Auth (modèles d’email, URL de redirection, quotas et politiques de mots de passe) n’ont pas été modifiés par le connecteur. L’API Auth conserve son réglage `disable_signup=false`, mais le trigger bloque tout email absent de la liste privée. Ne pas désactiver ce trigger sans remplacer cette protection.

Pour un second parent, le propriétaire doit désigner explicitement l’email à ajouter au même foyer. Retirer une autorisation existante exige de supprimer aussi le membership et révoquer les sessions : retirer seulement l’email de la liste empêche une nouvelle inscription, sans retirer les accès déjà accordés.

## Tests exécutés

- Tests Node, DOM et PostgreSQL embarqué (`npm test`).
- `supabase/verify_hosted_security.sql` exécuté sur la base hébergée : anon bloqué, compte sans membership bloqué, foyers isolés, lien enfant/foyer contrôlé, écriture concurrente obsolète refusée, propriétaire non modifiable.
- `supabase/verify_parent_onboarding.sql` : inscription non autorisée refusée, email non confirmé sans accès, rattachement après confirmation et liste privée inaccessible. Le connecteur ne peut pas prendre le rôle supabase_auth_admin ; les tests hébergés passent par le rôle de gestion, complétés par un test local du rôle Auth.
- Appels HTTPS réels de lecture, avec la clé publique, refusés sur les profils privés et les anciennes tables.
- Comptes et données de test exclusivement synthétiques, annulés par ROLLBACK. Aucune donnée de test conservée et aucun email envoyé.

À valider après création du vrai compte parent : confirmation email de bout en bout, connexion sur deux appareils, synchronisation A → B → A, expiration de session et test Safari/iPhone.

## Sources SQL

La migration initiale `001_family_security.sql` correspond à `mcs_family_security` dans l’historique hébergé. Les fichiers du dossier migrations conservent les corrections suivantes. Ne pas réappliquer les migrations déjà présentes. Le schéma prototype historique n’a pas de migration initiale dans ce dépôt ; les scripts de durcissement qui le ciblent supposent sa présence.

## Confidentialité

Les sessions Auth utilisent `sessionStorage`. Les données cloud restent en mémoire de l’onglet. Le mode local n’est pas chiffré et reste accessible aux autres utilisateurs du même profil navigateur. Les données locales ne sont envoyées que par la commande de copie explicite. Les espaces enfants restent des vues accompagnées du compte parent.

Ne pas publier dans Git les emails autorisés, UUID de foyer, tokens, devoirs, prénoms, exports ou captures familiales.

Référence des alertes traitées : https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Planning et imports (version 2.2)

`mcs_planning_preferences` conserve les disponibilités privées de chaque enfant. RLS et clé étrangère composite limitent ces lignes au foyer du parent. Le contrôle de version protège les réglages contre les écrasements concurrents. Les mises à jour périodiques attendent pendant la saisie d’un formulaire pour préserver son contenu.

`mcs_tasks.detail_missing` signale les consignes à compléter, `is_assessment` les évaluations et `source_key` permet un import administratif sans doublons. Aucune consigne réelle n’est livrée dans une migration ou un test. Les durées importées sont provisoires et modifiables. Les statuts ambigus d’une source restent explicités dans la consigne sans être convertis arbitrairement en travaux terminés.

Les horaires, lieux et budgets restent dans la base privée. Les pauses sont comprises dans les budgets du planning. Les absences ponctuelles et les horaires de cours précis ne sont pas déduits automatiquement ; une proposition le jour de l’échéance doit être vérifiée par le parent.

Point Auth restant : l’analyseur signale la protection contre les mots de passe compromis comme désactivée. Ce réglage global n’est pas modifiable par les outils du connecteur actuellement disponibles. Référence : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
