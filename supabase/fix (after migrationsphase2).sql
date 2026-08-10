create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, username, recovery_code_hash)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'recovery_code_hash'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

drop policy if exists "profil cree a l inscription" on profiles;
