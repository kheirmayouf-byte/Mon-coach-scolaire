# Connexion de la base privée

## État de vérification

Le dépôt initial ne contient ni schéma SQL, ni identifiant de projet, ni configuration Supabase. La base hébergée n’a donc pas été examinée ou modifiée pendant cette livraison. Les tests automatisés valident le nouveau schéma sur PostgreSQL embarqué, et non le projet hébergé.

## Ordre des opérations

1. Sauvegarder la base initiale et conserver ses politiques avant modification.
2. Exécuter `supabase/audit.sql` dans le SQL Editor et examiner les résultats : RLS de toutes les tables exposées, grants, fonctions SECURITY DEFINER, vues et buckets publics. Les politiques permissives sont combinées par OR : ajouter une politique restrictive n’annule pas une politique existante ouverte.
3. Vérifier qu’il n’existe pas déjà de tables `mcs_*`. Appliquer une seule fois `supabase/001_family_security.sql`. En cas de collision, la transaction échoue sans modifier les tables existantes.
4. Désactiver les inscriptions publiques dans Supabase Auth. Créer ou inviter les comptes parents depuis l’administration. Chaque parent termine personnellement la création de son mot de passe. Ne jamais mettre de mot de passe dans SQL ou Git.
5. Provisionner un foyer, deux profils et les membres depuis l’administration. Les UUID réels et les prénoms restent exclusivement dans le projet privé.

Exemple conceptuel à adapter **dans la console privée uniquement** :

```sql
begin;
-- Créer un UUID de foyer et le conserver dans la console privée.
insert into public.mcs_families default values returning id;
-- Puis, avec ce même UUID et ceux des comptes Auth existants :
-- insert into public.mcs_members(user_id,family_id) values (...,...);
-- insert into public.mcs_children(family_id,name) values (...,...),(...,...);
commit;
```

6. Vérifier les URL Auth autorisées, la confirmation d’email, les fournisseurs et les réglages de session. L’interface utilise la connexion mot de passe, sans redirection OAuth ou lien magique.
7. Dans l’application, Parents & connexion : URL du projet et clé **publishable** ou ancienne clé **anon**. Jamais `service_role`, clé secrète ou URL de connexion PostgreSQL. Les clés publiques ne confèrent des droits que dans la limite des règles de base.
8. Se connecter avec un parent autorisé. Les données locales ne sont jamais fusionnées automatiquement. Personnaliser les deux profils privés. Pour copier les devoirs locaux, utiliser les mêmes prénoms dans les deux modes puis lancer une seule copie explicite depuis les paramètres. Les UUID locaux sont conservés pour empêcher une seconde insertion silencieuse. Après une réponse réseau ambiguë, actualiser avant de réessayer.

## Tests indispensables dans le projet hébergé

- Hors connexion : aucune lecture/écriture sur les tables privées.
- Compte authentifié sans membership : aucun profil ou devoir visible ; aucune auto-attribution de membership possible.
- Deux foyers de test : ni lecture ni écriture croisée, y compris en appelant directement l’API.
- Deux parents du même foyer : ajout sur l’appareil A, lecture sur B, complétion sur B puis lecture sur A.
- Modification concurrente : la deuxième écriture avec une version obsolète ne doit pas écraser la première.
- Déconnexion : données cloud retirées de la vue et session de cet onglet supprimée.
- Vérifier aussi les tables **antérieures** et Storage : la migration ne les sécurise pas automatiquement.

## Modèle de sécurité

Seuls les administrateurs provisionnent les foyers et les membres. Les membres ne peuvent consulter que leur propre rattachement. Les tables enfants, devoirs et fiches appliquent une isolation par foyer fondée sur `auth.uid()` ; aucune confiance n’est accordée à des métadonnées utilisateur modifiables. Les clés étrangères composites empêchent de lier un devoir à l’enfant d’un autre foyer. Les grants interdisent de déplacer un devoir ou de changer son propriétaire. La fonction de renommage reste SECURITY INVOKER et respecte les RLS.

Les sessions Auth sont conservées dans `sessionStorage` et les données cloud seulement en mémoire. Fermer l’onglet ou se déconnecter termine leur conservation locale normale ; une session peut subsister sur d’autres onglets/appareils. Le mode local n’est pas chiffré et reste accessible sur le même profil navigateur. GitHub Pages est un hébergement public du code, pas un coffre pour les données.

Ne pas publier dans une issue ou un commit les résultats contenant identifiants privés, devoirs, prénoms, emails, tokens ou captures familiales.
