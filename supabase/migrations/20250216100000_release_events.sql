-- Release events versioning system
-- Adapted from alpacapps: date-based version format vYYMMDD.NN with daily counter

-- Monotonically increasing sequence for absolute ordering
create sequence if not exists release_event_seq start with 1;

-- Main release events table
create table if not exists release_events (
  seq         bigint primary key default nextval('release_event_seq'),
  display_version text not null,
  push_sha    text not null unique,
  branch      text not null default 'main',
  compare_from_sha text,
  compare_to_sha   text,
  pushed_at   timestamptz not null default now(),
  actor_login text,
  source      text not null default 'github-main-push',
  model_code  text not null default 'ci',
  machine_name text,
  metadata    jsonb default '{}'::jsonb
);

-- Individual commits within each release
create table if not exists release_event_commits (
  id            bigint generated always as identity primary key,
  release_seq   bigint not null references release_events(seq) on delete cascade,
  sha           text not null,
  short_sha     text not null,
  author        text,
  message       text,
  committed_at  timestamptz
);

create index if not exists idx_release_event_commits_seq on release_event_commits(release_seq);

-- Function to record a release event and compute vYYMMDD.NN version
create or replace function record_release_event(
  p_push_sha       text,
  p_branch         text default 'main',
  p_compare_from   text default null,
  p_compare_to     text default null,
  p_actor          text default null,
  p_source         text default 'github-main-push',
  p_model_code     text default 'ci',
  p_machine_name   text default null,
  p_commits        jsonb default '[]'::jsonb
)
returns table(display_version text, seq bigint)
language plpgsql
as $$
declare
  v_now           timestamptz;
  v_date_str      text;
  v_daily_count   int;
  v_display       text;
  v_seq           bigint;
  v_time_str      text;
  v_commit        jsonb;
begin
  -- Use Austin, TX timezone for consistency (matching alpacapps)
  v_now := now() at time zone 'America/Chicago';
  v_date_str := to_char(v_now, 'YYMMDD');

  -- Count how many releases today (in Austin time)
  select count(*) + 1 into v_daily_count
  from release_events re
  where to_char(re.pushed_at at time zone 'America/Chicago', 'YYMMDD') = v_date_str;

  -- Format time as H:MMa/p (e.g., "1:01p", "11:30a")
  v_time_str := ltrim(to_char(v_now, 'HH12:MI'), '0') ||
                lower(substring(to_char(v_now, 'AM') from 1 for 1));

  -- Build display version: vYYMMDD.NN H:MMa/p
  v_display := 'v' || v_date_str || '.' || lpad(v_daily_count::text, 2, '0') || ' ' || v_time_str;

  -- Insert or update (idempotent per push SHA)
  insert into release_events (display_version, push_sha, branch, compare_from_sha, compare_to_sha, pushed_at, actor_login, source, model_code, machine_name)
  values (v_display, p_push_sha, p_branch, p_compare_from, p_compare_to, now(), p_actor, p_source, p_model_code, p_machine_name)
  on conflict (push_sha) do update set
    branch = excluded.branch,
    actor_login = excluded.actor_login,
    source = excluded.source,
    model_code = excluded.model_code,
    machine_name = excluded.machine_name
  returning release_events.seq, release_events.display_version into v_seq, v_display;

  -- Insert commits
  for v_commit in select * from jsonb_array_elements(p_commits)
  loop
    insert into release_event_commits (release_seq, sha, short_sha, author, message)
    values (
      v_seq,
      v_commit->>'sha',
      v_commit->>'short_sha',
      v_commit->>'author',
      v_commit->>'message'
    )
    on conflict do nothing;
  end loop;

  return query select v_display, v_seq;
end;
$$;
