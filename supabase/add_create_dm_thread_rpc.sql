-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Corrige : la création d'un fil de discussion créait bien la ligne, mais
-- la relecture automatique juste après (pour renvoyer son id) échouait,
-- car l'utilisateur n'était pas encore ajouté comme membre à ce moment
-- précis (policy de lecture qui exige d'être membre). On fait tout en une
-- seule opération atomique côté serveur pour éviter ce problème d'ordre.
-- ============================================================

create or replace function public.create_dm_thread(p_is_group boolean, p_name text, p_member_ids uuid[])
returns uuid
security definer set search_path = public as $$
declare
  new_id uuid;
  m uuid;
begin
  insert into dm_threads (is_group, name, created_by) values (p_is_group, p_name, auth.uid())
  returning id into new_id;

  insert into dm_thread_members (thread_id, user_id) values (new_id, auth.uid());

  foreach m in array p_member_ids loop
    if m <> auth.uid() then
      insert into dm_thread_members (thread_id, user_id) values (new_id, m)
      on conflict do nothing;
    end if;
  end loop;

  return new_id;
end;
$$ language plpgsql;

grant execute on function public.create_dm_thread(boolean, text, uuid[]) to authenticated;

-- Nettoyage : la fonction de debug n'est plus nécessaire, tu peux la retirer.
drop function if exists public.whoami();
