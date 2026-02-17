-- Versioned prompt library.
-- Each row is one version of a prompt, grouped by `name`.
-- Only one version per name should have is_active = true (enforced by unique partial index).

create table if not exists public.prompts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                          -- stable key, e.g. 'extract_financial_data'
  version     int  not null default 1,                -- increments per name
  content     text not null,                          -- the full prompt text
  category    text not null default 'general',        -- grouping: extraction, image_gen, email, etc.
  description text,                                   -- human summary of what this prompt does
  metadata    jsonb default '{}'::jsonb,              -- model hints, format args, etc.
  is_active   boolean not null default true,          -- only one active version per name
  created_by  uuid references auth.users(id),         -- who created this version
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- No duplicate versions for the same prompt name
  constraint prompts_name_version_unique unique (name, version)
);

-- Only one active version per prompt name
create unique index if not exists prompts_one_active_per_name
  on public.prompts (name)
  where is_active = true;

-- Fast lookups
create index if not exists prompts_category_idx on public.prompts (category);
create index if not exists prompts_name_idx on public.prompts (name);

-- Auto-update updated_at
create or replace function public.prompts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger prompts_set_updated_at
  before update on public.prompts
  for each row execute function public.prompts_updated_at();

-- RLS
alter table public.prompts enable row level security;

-- Anyone authenticated can read prompts
create policy "prompts_select_authenticated"
  on public.prompts for select
  to authenticated
  using (true);

-- Admin users can insert, update, delete
create policy "prompts_insert_admin"
  on public.prompts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles
      where user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "prompts_update_admin"
  on public.prompts for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "prompts_delete_admin"
  on public.prompts for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Helper: get the active version of a prompt by name
create or replace function public.get_prompt(prompt_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select content
  from prompts
  where name = prompt_name
    and is_active = true
  limit 1;
$$;

comment on function public.get_prompt(text)
is 'Returns the active version content for a given prompt name.';

-- Helper: create a new version of a prompt (deactivates previous active)
create or replace function public.create_prompt_version(
  p_name text,
  p_content text,
  p_category text default null,
  p_description text default null,
  p_metadata jsonb default null,
  p_created_by uuid default null
)
returns public.prompts
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version int;
  prev_category text;
  prev_description text;
  prev_metadata jsonb;
  result public.prompts;
begin
  -- Get next version number and carry forward category/description from previous
  select
    coalesce(max(version), 0) + 1,
    (select p2.category from prompts p2 where p2.name = p_name and p2.is_active order by p2.version desc limit 1),
    (select p2.description from prompts p2 where p2.name = p_name and p2.is_active order by p2.version desc limit 1),
    (select p2.metadata from prompts p2 where p2.name = p_name and p2.is_active order by p2.version desc limit 1)
  into next_version, prev_category, prev_description, prev_metadata
  from prompts
  where name = p_name;

  -- Deactivate all previous versions
  update prompts set is_active = false where name = p_name and is_active = true;

  -- Insert new version
  insert into prompts (name, version, content, category, description, metadata, is_active, created_by)
  values (
    p_name,
    next_version,
    p_content,
    coalesce(p_category, prev_category, 'general'),
    coalesce(p_description, prev_description),
    coalesce(p_metadata, prev_metadata, '{}'::jsonb),
    true,
    p_created_by
  )
  returning * into result;

  return result;
end;
$$;

comment on function public.create_prompt_version(text, text, text, text, jsonb, uuid)
is 'Creates a new version of a prompt, deactivating the previous active version. Carries forward category/description/metadata if not provided.';

comment on table public.prompts is 'Versioned prompt library. Each prompt has a stable name and multiple versions; only one version per name is active.';
