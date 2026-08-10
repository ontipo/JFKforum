-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Ajoute le type d'hébergement (en ligne = expire après 3 mois /
-- physique = permanent) et la date d'approbation, nécessaires
-- pour la photo de profil et la bannière.
-- ============================================================

alter table profiles add column if not exists pfp_hosting text check (pfp_hosting in ('online', 'physical'));
alter table profiles add column if not exists pfp_approved_at timestamptz;

alter table profiles add column if not exists banner_hosting text check (banner_hosting in ('online', 'physical'));
alter table profiles add column if not exists banner_approved_at timestamptz;
