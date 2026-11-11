# ChatGPT dans la version ordinateur

Version 3.3.0 : client personnel et local pour l’abonnement ChatGPT via
Sign in with ChatGPT. Aucun secret API ni crédit Platform nécessaire.
Le site hébergé ne reçoit jamais les jetons ChatGPT. La fonction Supabase
`coach-ai` reste désactivée et n’est jamais appelée par la version ordinateur.
L’éligibilité Plus et l’inférence réelle restent à vérifier sur le poste du parent.

## Utilisation

Voir [le guide Windows](../desktop/LISEZ-MOI.txt). Le compte parent Supabase
est nécessaire pour retrouver le foyer existant. Les données cloud utilisent
toujours les règles RLS existantes. Le profil pédagogique doit être confirmé
individuellement avant tout envoi. Aucune récupération automatique des projets
ChatGPT « Prof Noor » ou « Prof Bettina ».

La première version traite des textes : aide écrite et quiz QCM depuis les
supports vérifiés. Ni analyse automatique des photos, ni transcription audio,
ni vidéo. La lecture orale utilise les capacités locales du système.

## Compilation reproductible

Node 24, Git, accès npm/GitHub ; les versions sont verrouillées dans les deux
package-lock.json. À la racine : `npm ci && npm test`. Puis dans `desktop` :
`npm ci`, `npm test`, `npm run package:windows`.
`npm run start` lance la version de développement ; Electron 45 demande
`node node_modules/electron/install.js` lors de la première installation locale.
La création du paquet télécharge le runtime Windows avec vérification des sommes
de contrôle par les outils Electron. Aucune clé ni compte n’est inclus.

## Limites et sécurité

- SDK officiel vendored au commit exact, sans modification ; provenance,
  licence non commerciale et tests d’origine conservés sous `desktop/vendor/siwc`.
- OAuth avec PKCE, state, nonce et validation ID token gérés par le SDK ;
  callback `127.0.0.1` à port dynamique, identifiant d’installation persistant.
- Chiffrement obligatoire Electron safeStorage (DPAPI sur Windows), stockage
  hors du dépôt. Aucun secours en clair si le coffre est indisponible.
- Renderer isolé, sandbox, sans Node, CSP restrictive ; IPC limité à la fenêtre
  principale et son URL locale fixe. Aucun jeton ChatGPT renvoyé au renderer.
- Catalogue de modèles réellement accordés au compte ; réponses complètes
  uniquement. `store:false`, `stream:true`, pas de clé d’environnement héritée.
- Erreurs de quota sans nouvelle tentative automatique ni recours à l’API payante.
- Import ÉcoleDirecte : relais local limité à son endpoint Supabase fixe,
  avec le JWT du parent, sans persistance du mot de passe ou du JWT côté main.
- Le navigateur conserve son origine publique ; l’application utilise une origine
  locale distincte et ne copie ni cookies ni sessions du navigateur.
- Paquet Windows portable non signé : lancement Windows et vrai compte Plus
  à valider par l’utilisateur. Les tests automatisés utilisent des comptes fictifs.

Références : https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
et https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.
