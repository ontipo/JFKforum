-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Corrige : les clics sur les pubs ne s'enregistraient pas dans ad_stats.
-- Cause probable : la fonction n'avait pas explicitement le droit d'exécution
-- pour les rôles anon/authenticated (selon la configuration du projet).
-- ============================================================

grant execute on function public.record_ad_click(text) to anon, authenticated;
