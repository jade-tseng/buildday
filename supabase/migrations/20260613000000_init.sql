-- search_cache: one row per concept, stores the full API response JSON
create table search_cache (
  concept      text primary key,
  response     jsonb not null,
  computed_at  timestamptz default now()
);

-- query_log: lightweight analytics
create table query_log (
  id           uuid primary key default gen_random_uuid(),
  concept      text,
  cache_hit    boolean,
  duration_ms  integer,
  created_at   timestamptz default now()
);
