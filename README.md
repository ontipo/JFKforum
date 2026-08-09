# Forum — socle

## Ce qui est fait (cette étape)
- `schema.sql` : toute la base (profils, catégories, posts, réponses, réactions, notifications, demandes d'images) + RLS.
- Design system sombre/argenté avec animations (`css/style.css`).
- Inscription (`register.html`) : pseudo `!nom`, email, mot de passe, génération du code de 560 caractères + export PDF.
- Connexion (`login.html`) + récupération via le PDF du code.
- `supabase/functions/recover-account` : fonction serveur qui vérifie le code et réinitialise le mot de passe.
- `index.html` : structure du fil, catégories, recherche, affichage des posts réels depuis Supabase.

## Mise en route
1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, colle et exécute `schema.sql`.
3. Dans **Project Settings > API**, copie l'URL et la clé `anon`, colle-les dans `js/supabase-client.js`.
4. Déploie la fonction de récupération :
   ```
   supabase functions deploy recover-account
   ```
   (nécessite la CLI Supabase, et que `SUPABASE_SERVICE_ROLE_KEY` soit configurée automatiquement par Supabase pour la fonction).
5. Pousse ce dossier sur un dépôt GitHub, active **GitHub Pages** sur la branche principale. Tout est en HTML/JS statique, aucun build n'est nécessaire.

## Note honnête sur le système de code à 560 caractères
Ça fonctionne tel que demandé : le code n'existe que dans le PDF de l'utilisateur, seul son hash est stocké côté serveur. Le vrai risque, c'est que ce hash reste un secret à vie sans rotation possible — si la base fuite un jour, ces hashs ne peuvent pas être "changés" comme un mot de passe. Rien à faire pour l'instant, juste à garder en tête pour plus tard si tu veux ajouter une rotation.

## Prochaines briques (pas encore construites)
- Modal de publication complet (titre, texte libre, hashtags ≤ 50, mentions, anonymat).
- Réactions fonctionnelles (like / superlike ×3 / dislike) branchées sur `reactions`.
- Page d'un post (réponses, tag "AU" pour l'auteur).
- Compte utilisateur (avatar/bannière par lien + validation admin, historique).
- Notifications en temps réel.
- Panneau modération (suppression de posts, création de catégories, ajout d'admins).
- Badges visuels (tu fournis les images carrées/rectangulaires, `js/badges.js` calcule déjà le niveau).
- FYP mélangée aléatoirement.
