create extension if not exists pgcrypto;

create table if not exists cz_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  kind text not null,
  state text not null,
  version integer not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cz_records_company_kind on cz_records(company_id, kind);
create index if not exists cz_records_updated on cz_records(updated_at desc);

create table if not exists cz_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  actor text not null,
  action text not null,
  subject_kind text not null,
  subject_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cz_audit_company_time on cz_audit_events(company_id, created_at desc);

alter table cz_records enable row level security;
alter table cz_audit_events enable row level security;

