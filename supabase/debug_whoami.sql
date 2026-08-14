-- ============================================================
-- DIAGNOSTIC TEMPORAIRE — à coller dans Supabase > SQL Editor
-- Révèle ce que le serveur voit comme "toi" (auth.uid()) au moment
-- d'une vraie requête authentifiée. À supprimer une fois le bug trouvé.
-- ============================================================

create or replace function public.whoami() returns uuid
language sql stable as $$
  select auth.uid();
$$;

grant execute on function public.whoami() to anon, authenticated;
