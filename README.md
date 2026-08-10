# Forum — version HTML statique (GitHub Pages)

Site 100% HTML / CSS / JavaScript vanilla (aucun build, aucun `npm install` requis pour le faire tourner). Il se connecte à Supabase directement depuis le navigateur. Compatible **GitHub Pages**.

## Ce que contient cette version (le « socle »)

Identique à la version précédente, mais en HTML pur :

- Authentification Supabase (inscription pseudo `!...` + e-mail + mot de passe, connexion).
- Code de récupération de 560 caractères (`code:[240]NIP[320]`) généré à l'inscription et téléchargé en PDF ; page « mot de passe oublié » qui relit le PDF et réinitialise le mot de passe via une **fonction serveur Supabase** (nécessaire : GitHub Pages ne peut pas garder de clé secrète).
- Catégories Informatique / Société / Autres.
- Posts (titre, texte libre, aperçu 300 caractères, anonymat, 50 hashtags max, mentions `@!pseudo`, horodatage, lien de partage `[SITE]/?={id}`, liens interdits).
- Votes (superlike ×3 / like +1 / dislike −1), un vote par personne, pas de vote sur son propre post.
- Commentaires avec tag **AU**.
- Recherche, bouton « actualiser » (mélange le fil), rôles avec badges, niveaux selon les likes reçus.

Phase 2 (pas encore fait) : panneau admin, photo de profil/bannière validée par un admin, notifications, ToS détaillées.

## Étape 1 — Créer le projet Supabase

1. [supabase.com](https://supabase.com) → New project (gratuit).
2. **SQL Editor** → New query → collez tout `supabase/schema.sql` → Run.
3. **Authentication → Settings** : vous pouvez désactiver « Confirm email » pour simplifier les tests.
4. **Project Settings → API** : notez `Project URL` et `anon public key`.

## Étape 2 — Déployer la fonction de réinitialisation de mot de passe

Cette fonction a besoin de la clé secrète (`service_role`), donc elle ne peut PAS vivre dans le site statique — elle tourne sur Supabase (gratuit, inclus dans votre projet).

```bash
npm install -g supabase
supabase login
supabase link --project-ref VOTRE_REF_DE_PROJET
supabase functions deploy reset-password
```

(La `VOTRE_REF_DE_PROJET` est visible dans l'URL de votre projet Supabase : `xxxxxxxxxxxx` dans `https://xxxxxxxxxxxx.supabase.co`.) Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement par Supabase, rien à configurer.

## Étape 3 — Configurer le site

Ouvrez `assets/config.js` et remplissez :

```js
export const SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
```

La clé `anon` est publique par nature (elle sera visible dans le code source) — c'est normal et sans danger : c'est la sécurité au niveau des lignes (RLS, déjà activée dans `schema.sql`) qui protège réellement les données.

## Étape 4 — Mettre en ligne sur GitHub Pages

1. Créez un dépôt GitHub et poussez tout le contenu de ce dossier à la racine :
   ```bash
   git init
   git add .
   git commit -m "Forum"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages → Source** → branche `main`, dossier `/ (root)` → Save.
3. Après une ou deux minutes, le site est en ligne à `https://VOTRE-COMPTE.github.io/VOTRE-DEPOT/`.

Le fichier `.nojekyll` est déjà présent pour empêcher GitHub de traiter le site avec Jekyll (ce qui casserait certains fichiers).

## Étape 5 — Devenir owner / modérateur

Après inscription sur le site, allez dans Supabase → **Table Editor → profiles** → modifiez la colonne `role` de votre compte à `owner`.

## Tester en local

Comme le site utilise des modules JavaScript (`type="module"`), il doit être servi via HTTP (pas ouvert directement en double-cliquant sur le fichier). Le plus simple :

```bash
npx serve .
```

puis ouvrez l'adresse affichée.

## Structure

```
index.html              → fil d'actualité, recherche, publication, vue post partagé
login.html / register.html / forgot-password.html / account.html
assets/
  style.css              → thème sombre/argenté
  config.js               → vos clés Supabase (à remplir)
  supabaseClient.js
  utils.js, hash.js, recoveryPdf.js
  navbar.js, userBadge.js, voteButtons.js, commentSection.js, postCard.js, postModal.js
  feed.js, auth-register.js, auth-login.js, auth-forgot.js, account.js
supabase/
  schema.sql              → tables + sécurité (RLS) + triggers
  functions/reset-password/index.ts  → fonction serveur (mot de passe oublié)
```

## Sécurité — à savoir

- Le système de récupération par PDF remplace le mot de passe oublié classique par e-mail : si vous perdez à la fois vos identifiants et le PDF, il n'existe aucun autre moyen de récupérer le compte.
- Ne mettez jamais la clé `service_role` dans le code du site (elle ne l'est pas ici — elle reste uniquement dans la fonction Supabase, côté serveur).
