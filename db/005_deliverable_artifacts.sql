-- Company Zero durable deliverable/artifact layer.
-- Supabase Storage holds bytes; these tables hold immutable identities, revisions, manifests and provenance.

create table if not exists cz_deliverable_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  deliverable_contract_id uuid not null,
  session_id uuid,
  mission_id uuid,
  version integer not null,
  previous_revision_id uuid references cz_deliverable_revisions(id),
  state text not null default 'staging' check (state in ('staging','ready','failed','superseded')),
  title text not null,
  summary text not null default '',
  qa jsonb,
  source text not null default 'studio',
  failure jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, deliverable_contract_id, version)
);
create index if not exists cz_deliverable_revisions_contract on cz_deliverable_revisions(company_id,deliverable_contract_id,version desc);
create index if not exists cz_deliverable_revisions_staging on cz_deliverable_revisions(state,created_at) where state='staging';

create table if not exists cz_artifacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  deliverable_contract_id uuid not null,
  artifact_key text not null,
  type text not null default 'general',
  created_at timestamptz not null default now(),
  unique(company_id, deliverable_contract_id, artifact_key)
);

create table if not exists cz_artifact_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  artifact_id uuid not null references cz_artifacts(id),
  deliverable_revision_id uuid not null references cz_deliverable_revisions(id),
  revision integer not null,
  state text not null default 'staging' check (state in ('staging','ready','failed','superseded')),
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(artifact_id, revision),
  unique(deliverable_revision_id, artifact_id)
);
create index if not exists cz_artifact_revisions_deliverable on cz_artifact_revisions(deliverable_revision_id);

create table if not exists cz_artifact_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  artifact_revision_id uuid not null references cz_artifact_revisions(id) on delete cascade,
  relative_path text not null,
  mime_type text not null,
  byte_count bigint not null check (byte_count >= 0),
  sha256 text not null check (length(sha256)=64),
  storage_bucket text,
  storage_path text,
  state text not null default 'staging' check (state in ('staging','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(artifact_revision_id, relative_path),
  unique(storage_bucket, storage_path)
);
create index if not exists cz_artifact_files_revision on cz_artifact_files(artifact_revision_id);

-- Atomically reserves both the next deliverable revision and the next artifact revision.
-- Advisory locking prevents two workers from both choosing V(n+1).
create or replace function cz_reserve_deliverable_artifact_revision(
  p_company_id uuid,
  p_contract_id uuid,
  p_session_id uuid,
  p_mission_id uuid,
  p_artifact_key text,
  p_type text,
  p_title text,
  p_summary text,
  p_source text default 'studio'
) returns jsonb language plpgsql as $$
declare
  v_artifact cz_artifacts%rowtype;
  v_prev cz_deliverable_revisions%rowtype;
  v_delivery cz_deliverable_revisions%rowtype;
  v_artifact_revision cz_artifact_revisions%rowtype;
  v_artifact_revision_no integer;
  v_next_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_contract_id::text, 0));

  insert into cz_artifacts(company_id,deliverable_contract_id,artifact_key,type)
  values(p_company_id,p_contract_id,p_artifact_key,p_type)
  on conflict(company_id,deliverable_contract_id,artifact_key)
  do update set type=excluded.type
  returning * into v_artifact;

  select * into v_prev from cz_deliverable_revisions
   where company_id=p_company_id and deliverable_contract_id=p_contract_id and state='ready'
   order by version desc limit 1;
  select coalesce(max(version),0)+1 into v_next_version from cz_deliverable_revisions
   where company_id=p_company_id and deliverable_contract_id=p_contract_id;

  insert into cz_deliverable_revisions(company_id,deliverable_contract_id,session_id,mission_id,version,previous_revision_id,title,summary,source)
  values(p_company_id,p_contract_id,p_session_id,p_mission_id,v_next_version,v_prev.id,p_title,p_summary,p_source)
  returning * into v_delivery;

  select coalesce(max(revision),0)+1 into v_artifact_revision_no from cz_artifact_revisions where artifact_id=v_artifact.id;
  insert into cz_artifact_revisions(company_id,artifact_id,deliverable_revision_id,revision)
  values(p_company_id,v_artifact.id,v_delivery.id,v_artifact_revision_no)
  returning * into v_artifact_revision;

  return jsonb_build_object(
    'artifactId',v_artifact.id,
    'artifactRevisionId',v_artifact_revision.id,
    'artifactRevision',v_artifact_revision.revision,
    'deliverableRevisionId',v_delivery.id,
    'deliverableVersion',v_delivery.version,
    'previousDeliverableRevisionId',v_delivery.previous_revision_id
  );
end $$;

create or replace function cz_finalize_deliverable_artifact_revision(
  p_company_id uuid,
  p_contract_id uuid,
  p_deliverable_revision_id uuid,
  p_artifact_revision_id uuid,
  p_manifest jsonb,
  p_qa jsonb,
  p_compat_artifact_id uuid
) returns jsonb language plpgsql as $$
declare
  v_delivery cz_deliverable_revisions%rowtype;
begin
  update cz_artifact_files set state='ready',updated_at=now()
   where company_id=p_company_id and artifact_revision_id=p_artifact_revision_id and state='staging';
  update cz_artifact_revisions set state='ready',manifest=p_manifest,updated_at=now()
   where id=p_artifact_revision_id and company_id=p_company_id;
  update cz_deliverable_revisions set state='ready',qa=p_qa,updated_at=now()
   where id=p_deliverable_revision_id and company_id=p_company_id
   returning * into v_delivery;
  if v_delivery.id is null then raise exception 'deliverable_revision_not_found'; end if;

  update cz_records set
    state='ready',
    version=version+1,
    updated_at=now(),
    data=jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(data,'{status}','"ready"'::jsonb,true),
              '{latestArtifactId}',to_jsonb(p_compat_artifact_id),true),
            '{latestVersion}',to_jsonb(v_delivery.version),true),
          '{latestDeliverableRevisionId}',to_jsonb(v_delivery.id),true),
        '{deliverableRevisionCount}',to_jsonb((select count(*) from cz_deliverable_revisions where company_id=p_company_id and deliverable_contract_id=p_contract_id and state='ready')),true),
      '{completedArtifactKeys}',coalesce(data->'expectedArtifactKeys','["primary"]'::jsonb),true)
   where id=p_contract_id and company_id=p_company_id and kind='deliverable_contract';

  return jsonb_build_object('deliverableVersion',v_delivery.version,'deliverableRevisionId',v_delivery.id);
end $$;

create or replace function cz_fail_deliverable_artifact_revision(
  p_company_id uuid,
  p_deliverable_revision_id uuid,
  p_artifact_revision_id uuid,
  p_failure jsonb
) returns void language plpgsql as $$
begin
  update cz_artifact_files set state='failed',updated_at=now() where company_id=p_company_id and artifact_revision_id=p_artifact_revision_id and state='staging';
  update cz_artifact_revisions set state='failed',updated_at=now() where company_id=p_company_id and id=p_artifact_revision_id and state='staging';
  update cz_deliverable_revisions set state='failed',failure=p_failure,updated_at=now() where company_id=p_company_id and id=p_deliverable_revision_id and state='staging';
end $$;
