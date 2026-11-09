# Import ÉcoleDirecte — version expérimentale

Depuis le compte parent connecté au coach, ouvrir **Importer**, se connecter à ÉcoleDirecte avec un compte parent ou élève et répondre soi-même à la vérification demandée. Associer explicitement l’élève ÉcoleDirecte au profil du coach, choisir une période de 14 jours maximum, lire et vérifier l’aperçu, puis importer les nouveaux devoirs sélectionnés. Répéter pour l’autre enfant si les deux sont accessibles au compte ; sinon ouvrir une connexion séparée.

## Périmètre

- Lecture du cahier des devoirs à venir : matières, consignes, dates, indicateur d’évaluation, noms des pièces jointes. Les pièces jointes, liens de ressources et contenus de séance ne sont pas téléchargés. Les documents se consultent sur le site ÉcoleDirecte.
- Une durée initiale de 20 minutes est proposée et reste modifiable. Les devoirs sont ajoutés à faire ; la validation dans ÉcoleDirecte n’est pas reprise automatiquement.
- Import des nouveaux devoirs en une seule insertion transactionnelle sous les règles RLS existantes. La contrainte `(child_id, source_key)` bloque aussi les doublons entre appareils. Aucune modification du schéma ni des permissions n’est requise.
- Un devoir déjà importé est conservé. Les différences de consigne ou d’échéance sont signalées dans l’aperçu ; elles doivent être reportées avec « Modifier » dans le coach. Aucune suppression ni écriture dans ÉcoleDirecte. Pas de synchronisation programmée.
- L’identité source associe année scolaire (bascule au mois d’août), identifiant élève et identifiant devoir. Un changement d’échéance dans la même année scolaire ne crée pas de doublon. Une réaffectation vers un autre profil compte comme un nouvel import : vérifier soigneusement la correspondance.

## Confidentialité et contrôle d’accès

Le mot de passe est transmis en HTTPS à la fonction Supabase `ecoledirecte`, puis à l’API ÉcoleDirecte. Il n’est écrit ni en base ni dans les journaux applicatifs. Pendant une vérification, les identifiants nécessaires à la finalisation sont dans une enveloppe AES-GCM chiffrée et liée à l’utilisateur parent, valable 5 minutes, conservée uniquement dans la mémoire de l’onglet. Après authentification, le mot de passe est supprimé de l’état ; l’enveloppe de session expire au bout de 20 minutes. Rechargement, déconnexion parent ou fermeture de la connexion dans le coach effacent la référence en mémoire. Fermer dans le coach ne révoque pas une copie éventuelle de l’enveloppe avant son expiration.

La fonction garde la vérification JWT plateforme activée, valide à nouveau l’utilisateur auprès de Supabase Auth et exige son appartenance à un foyer avec les permissions de cet utilisateur. Elle n’utilise pas de clé d’administration pour lire ou écrire la base. Le chiffrement utilise `MCS_ED_ENCRYPTION_KEY` si configurée ; à défaut une clé dérivée du secret serveur Supabase, avec séparation de domaine. La rotation de ce secret invalide les enveloppes existantes. Aucun secret serveur n’est envoyé au navigateur.

L’origine navigateur autorisée est `https://kheirmayouf-byte.github.io`. Les élèves accessibles sont extraits de la réponse authentifiée et scellés dans l’enveloppe ; aucun identifiant élève arbitraire ni URL d’API libre n’est accepté. Routes fixes, délais réseau, absence de redirection et aucune répétition automatique des tentatives d’authentification. Limitation de fréquence en mémoire par instance de fonction (pas un quota global distribué). Le HTML des enseignants est converti en texte inerte avant stockage.

## Déploiement et limites de validation

Déployer `supabase/functions/ecoledirecte/index.ts`, `protocol.js` et `envelope.js` avec `verify_jwt: true`, puis publier le bundle normal `app.js` et `index.html`. Le domaine ÉcoleDirecte n’a pas besoin d’être autorisé par la CSP du navigateur : seul le serveur l’appelle.

Le déploiement du connecteur reste en attente d’un accord explicite sur le transit des identifiants par Supabase. Aucune fonction n’a été déployée au cours de cette préparation.

Le protocole n’est ni publié ni garanti par Aplim. Le paramètre de version `4.101.4` et les échanges de connexion sont fondés sur le projet de référence https://github.com/jeromeboivin/EcoleDirecteMCP consulté le 9 novembre 2026 ; ce protocole est implémenté ici séparément. Si ÉcoleDirecte bloque le serveur, change l’authentification ou son format, le connecteur affiche un échec et n’importe rien. Ne pas multiplier les tentatives ; passer par le site officiel en cas de blocage ou de charte à accepter.

`npm test` vérifie le traitement de contenu hostile, la détection des doublons, l’association aux profils, le chiffrement et l’expiration, les parcours question/TOTP, les refus d’accès et le parcours UI d’import avec services simulés. Ces tests ne valident pas une authentification réelle ÉcoleDirecte : un premier essai doit être fait par le parent dans l’application, sans transmettre son mot de passe dans la conversation.
