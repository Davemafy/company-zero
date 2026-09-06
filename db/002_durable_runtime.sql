create table if not exists cz_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  job_id uuid not null unique,
  kind text not null default 'execute_job',
  state text not null default 'queued' check (state in ('queued','claimed','running','waiting_for_approval','evaluating','completed','failed','retry_scheduled','uncertain','cancelled','dead_letter')),
  priority integer not null default 100,
  attempt integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, idempotency_key)
);
create index if not exists cz_queue_claimable on cz_queue(state, available_at, priority, created_at);

create table if not exists cz_state_transitions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, subject_kind text not null,
  subject_id uuid not null, from_state text, to_state text not null, reason text, evidence_ids uuid[] not null default '{}',
  actor text not null, created_at timestamptz not null default now()
);
create index if not exists cz_transitions_subject on cz_state_transitions(subject_id, created_at);

create table if not exists cz_worker_heartbeats (
  worker_id text primary key, version text not null, current_queue_id uuid, metadata jsonb not null default '{}',
  started_at timestamptz not null default now(), heartbeat_at timestamptz not null default now()
);

create table if not exists cz_idempotency (
  company_id uuid not null, scope text not null, key text not null, resource_id uuid not null,
  request_hash text not null, created_at timestamptz not null default now(), primary key(company_id, scope, key)
);

create table if not exists cz_approvals (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, job_id uuid not null, run_id uuid not null,
  invocation_id uuid not null, organization_revision_id uuid not null, role_id text not null, capability_id uuid not null,
  reason text not null, risk text not null, arguments jsonb not null, state text not null default 'pending' check(state in ('pending','approved','rejected','expired')),
  decided_by text, decision_reason text, decided_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists cz_budget_ledger (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, run_id uuid, experiment_id uuid,
  role_id text, capability_id uuid, amount_usd numeric(18,8) not null check(amount_usd >= 0), category text not null,
  source_ref text not null unique, created_at timestamptz not null default now()
);

create or replace function cz_claim_work(p_worker_id text, p_lease_seconds integer default 60)
returns setof cz_queue language plpgsql security definer as $$
declare claimed_id uuid;
begin
  update cz_queue q set state='claimed', lease_owner=p_worker_id,
    lease_expires_at=now()+make_interval(secs=>p_lease_seconds), attempt=q.attempt+1, updated_at=now()
  where q.id=(select id from cz_queue where
    ((state in ('queued','retry_scheduled') and available_at<=now()) or (state in ('claimed','running','evaluating') and lease_expires_at<now()))
    and attempt<max_attempts order by priority asc, created_at asc for update skip locked limit 1)
  returning q.id into claimed_id;
  return query select * from cz_queue where id=claimed_id;
end $$;

create or replace function cz_renew_lease(p_queue_id uuid,p_worker_id text,p_lease_seconds integer default 60)
returns boolean language sql security definer as $$
 update cz_queue set lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
 where id=p_queue_id and lease_owner=p_worker_id and state in ('claimed','running','evaluating') returning true;
$$;

create or replace function cz_enqueue(p_company_id uuid,p_job_id uuid,p_idempotency_key text default null)
returns cz_queue language plpgsql security definer as $$
declare result cz_queue;
begin
 insert into cz_queue(company_id,job_id,idempotency_key) values(p_company_id,p_job_id,p_idempotency_key)
 on conflict(company_id,idempotency_key) where idempotency_key is not null do update set updated_at=cz_queue.updated_at
 returning * into result; return result;
end $$;
