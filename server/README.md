# Relais Linux — préparation, non déployé

Ce répertoire prépare le relais ChatGPT sur un VPS sans Electron. Il utilise le
même SDK SIWC et le même moteur pédagogique que l’application Windows. Aucune clé
API ni solution de repli facturée à l’usage n’est utilisée.

**Ce changement ne fournit pas encore un accès depuis un téléphone.** Il prépare
le processus serveur et son coffre. Le transfert sécurisé de la connexion Windows,
le certificat HTTPS et le choix du relais distant dans l’interface restent à
implémenter et à vérifier ensemble avant activation.

## Validation locale

Depuis la racine du dépôt, avec Node 24 :

```sh
npm --prefix desktop ci --ignore-scripts
node server/build.mjs
node --test server/relay.test.mjs
npm --prefix desktop test
```

La compilation produit `server/build/relay.cjs`, autonome, sans Electron à exécuter
sur le serveur. Ne pas exécuter le service sous root. L’unité systemd fournie est
un modèle à installer seulement quand les étapes manquantes sont terminées.

## État persistant

`MCS_STATE_DIR` désigne un répertoire appartenant à l’utilisateur du service,
en mode 700 (par défaut `/var/lib/mcs-relay`). La commande `init` prépare :

- une clé AES-256-GCM privée en mode 600 (`vault.key`) ;
- une identité propre au VPS, persistante dans `chatgpt/chatgpt-host.json`.

`init` est idempotent et conserve la clé et l’identité existantes. `serve` refuse
une clé absente ou non privée. Aucun identifiant ni détail d’erreur SDK n’est
imprimé dans les journaux. La clé locale protège le fichier chiffré séparément ;
elle ne protège pas contre un attaquant contrôlant l’utilisateur du service.
Sauvegarder la clé et le coffre par des canaux protégés. Ne jamais les committer.

Le fichier administrateur `owner.json`, privé, indique `user` (identifiant parent
Supabase), `family` (identifiant famille) et `binding` (identifiant du profil SIWC).
Il ne contient aucun jeton. Le service refuse de démarrer sans connexion autorisée
correspondante et ne rattache jamais automatiquement le premier visiteur.

## Connexion ChatGPT : étape restante

La documentation SIWC décrit une connexion OAuth locale suivie d’un transfert
protégé des identifiants vers une VM auto-hébergée :
<https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms>.

Le coffre Windows est protégé par le système Windows. **Copier son fichier chiffré
sur Linux ne suffit pas.** Un export/import protégé dédié reste à ajouter. Ce
transfert devra préserver l’identité propre au VPS et donner au VPS la propriété
des rafraîchissements de cette connexion. Le verrou et la rotation atomique sont
déjà fournis par le SDK. Ne pas partager une même connexion active entre deux
machines qui rafraîchissent chacune ses jetons.

## Accès HTTP : privé jusqu’à configuration complète

Le service écoute seulement `127.0.0.1:4174`. Il conserve la vérification Supabase
des autorisations parent à usage unique, liées au corps et à l’action, le contrôle
d’origine, le contrôle du profil ChatGPT, la limitation de fréquence et de taille.
Les seules actions exposées sont `status`, `models`, `test`, `ask`.
Les connexions, rattachements, déconnexions et accès au coffre sont refusés sur HTTP.

Ne pas ouvrir le port 4174 ni publier le service tel quel. Un futur reverse proxy
HTTPS devra préserver l’origine attendue et transmettre `Host: 127.0.0.1:4174`.
L’interface actuelle contacte encore le relais Windows local. Le parcours complet
devra être testé sur téléphone et le serveur approuvé avant mise en service.
