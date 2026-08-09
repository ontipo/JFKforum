# Forum — Socle (v1)

Site de forum : Next.js 14 (App Router) + Supabase + Tailwind. Thème sombre / blanc / argenté.

## Ce que contient CETTE version (le « socle »)

- **Authentification Supabase** : inscription (pseudo commençant par `!`, e-mail, mot de passe) et connexion (e-mail + mot de passe).
- **Code de récupération** de 560 caractères au format `code:[240]NIP[320]`, généré à l'inscription, téléchargé en PDF. Le hash SHA-256 du code est stocké en base (jamais le code en clair). Page **« J'ai oublié mes informations »** : on joint le PDF, le code est extrait automatiquement, et un nouveau mot de passe peut être défini.
- **Catégories** : Informatique / Société / Autres, plus onglet « Tous ».
- **Publications** : titre + texte (sans limite), aperçu 300 caractères avec « voir plus », anonymat (affiché « Anonyme » aux utilisateurs normaux, « Anonyme (@pseudo) » aux modérateurs/fondateur), jusqu'à 50 hashtags, mentions `@!pseudo`, horodatage, lien de partage au format `[SITE]/?={id 11 chiffres}` (partage réservé aux connectés), liens interdits (vérifié côté client ET côté base de données).
- **Votes** : superlike (×3), like (+1), dislike (−1), un seul vote par personne et par post, impossible de voter pour son propre post.
- **Commentaires** : réponses sous chaque post, tag **AU** quand l'auteur du post répond à son propre post, anonymat identique aux posts.
- **Recherche** simple par titre / hashtag.
- **Bouton « actualiser »** qui mélange l'ordre du fil (base du « FYP »).
- **Rôles** : `user` / `moderator` / `owner`, avec badge affiché à côté du pseudo.
- **Titres/niveaux** selon les likes reçus (0 / 10 / 50 / 100 / 250 / 500).

## Ce qui n'est PAS encore fait (phase 2 — à demander ensuite)

- Panneau d'administration (créer des catégories, nommer des admins, supprimer des posts depuis l'interface, publier en tant qu'admin).
- Photo de profil / bannière soumises par lien externe + validation par un admin.
- Barre de notifications (mention, like reçu, commentaire reçu).
- Modification complète du profil.
- ToS (conditions d'utilisation) à rédiger avec la liste précise de ce qui est interdit.
- FYP « intelligent » (l'actuel mélange juste l'ordre déjà chargé).

## Installation

### 1. Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com) → New project (gratuit).
2. Une fois créé : **SQL Editor** → New query → collez tout le contenu de `supabase/schema.sql` → Run.
3. **Authentication → Providers** : laissez Email activé. Vous pouvez désactiver « Confirm email » dans **Authentication → Settings** pour simplifier les tests.
4. **Project Settings → API** : notez `Project URL`, `anon public key`, et `service_role key`.

### 2. Configurer le projet

```bash
cp .env.example .env.local
```

Remplissez `.env.local` avec les 3 valeurs notées ci-dessus.

### 3. Installer et lancer

```bash
npm install
npm run dev
```

Le site est disponible sur `http://localhost:3000`.

### 4. Déployer (optionnel)

Le plus simple : [Vercel](https://vercel.com) → importer le repo GitHub → ajouter les 3 variables d'environnement dans les réglages du projet Vercel → déployer.

### 5. Devenir owner / modérateur

Après inscription, dans Supabase → **Table Editor → profiles**, modifiez manuellement la colonne `role` de votre compte à `owner`.

## Structure du projet

```
app/                → pages (App Router)
  page.jsx           → fil d'actualité, recherche, publication
  login/ register/ forgot-password/  → authentification
  account/           → profil basique
  api/forgot-password/reset/  → route serveur (clé service_role)
components/          → composants réutilisables
lib/                 → clients Supabase, utilitaires, PDF
supabase/schema.sql  → tables, sécurité (RLS), triggers
```

## Sécurité — points à connaître

- Le code de récupération remplace le mot de passe oublié classique par e-mail : c'est un choix inhabituel, assumé par la demande initiale. Si vous perdez à la fois vos identifiants **et** le PDF, il n'existe aucun autre moyen de récupérer le compte avec ce système.
- La clé `service_role` (dans `.env.local`) ne doit jamais être publiée ni committée sur GitHub — elle donne un accès total à la base.
