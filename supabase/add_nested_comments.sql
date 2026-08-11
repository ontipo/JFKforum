-- ============================================================
-- À coller dans Supabase > SQL Editor > New query
-- Réponses imbriquées à l'infini (réponse à une réponse, etc.)
-- ============================================================

alter table public.comments
  add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx on public.comments(parent_comment_id);
