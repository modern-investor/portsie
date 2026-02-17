-- Open up prompts to all authenticated users (not just admins).
-- Users create and share prompts; they can update/delete their own.
-- Auto-stamp created_by with the inserting user's auth.uid().

-- Make created_by NOT NULL (every prompt must have an author)
alter table public.prompts alter column created_by set not null;

-- Default created_by to the current authenticated user
alter table public.prompts alter column created_by set default auth.uid();

-- Auto-stamp created_by on insert (overrides whatever the client sends)
create or replace function public.prompts_stamp_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists prompts_stamp_author on public.prompts;
create trigger prompts_stamp_author
  before insert on public.prompts
  for each row execute function public.prompts_stamp_author();

-- Drop admin-only policies
drop policy if exists "prompts_insert_admin" on public.prompts;
drop policy if exists "prompts_update_admin" on public.prompts;
drop policy if exists "prompts_delete_admin" on public.prompts;

-- Any authenticated user can insert prompts
drop policy if exists "prompts_insert_authenticated" on public.prompts;
create policy "prompts_insert_authenticated"
  on public.prompts for insert
  to authenticated
  with check (true);

-- Users can update their own prompts; admins can update any
drop policy if exists "prompts_update_own_or_admin" on public.prompts;
create policy "prompts_update_own_or_admin"
  on public.prompts for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.user_profiles
      where user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Users can delete their own prompts; admins can delete any
drop policy if exists "prompts_delete_own_or_admin" on public.prompts;
create policy "prompts_delete_own_or_admin"
  on public.prompts for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.user_profiles
      where user_id = auth.uid()
        and role = 'admin'
    )
  );
