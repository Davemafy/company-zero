-- Company Zero outcome-control indexes. Domain objects remain in the append-only cz_records store.
create unique index if not exists cz_success_condition_unique
  on cz_records(company_id,(data->>'missionId'),(data->>'metricId'))
  where kind='success_condition' and state='active';

create unique index if not exists cz_deliverable_key_unique
  on cz_records(company_id,(data->>'graphId'),(data->>'key'))
  where kind='deliverable' and state<>'cancelled';

create index if not exists cz_deliverable_graph_session
  on cz_records(company_id,(data->>'sessionId'),created_at)
  where kind='deliverable_graph';

create index if not exists cz_deliverable_state
  on cz_records(company_id,state,updated_at)
  where kind='deliverable';

create unique index if not exists cz_deliverable_dependency_unique
  on cz_records(company_id,(data->>'deliverableId'),(data->>'dependsOnDeliverableId'))
  where kind='deliverable_dependency';

create index if not exists cz_runtime_event_session
  on cz_records(company_id,(data->>'sessionId'),created_at)
  where kind='runtime_event';

create index if not exists cz_runtime_event_type
  on cz_records(company_id,(data->>'type'),created_at)
  where kind='runtime_event';
