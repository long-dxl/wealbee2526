-- Phase 4: structured provenance/evidence ledger.
alter table public.agent_runs add column if not exists data_as_of timestamptz;
alter table public.agent_runs add column if not exists provenance_summary jsonb not null default '{}'::jsonb;
alter table public.briefs add column if not exists as_of timestamptz;
alter table public.briefs add column if not exists provenance_summary jsonb not null default '{}'::jsonb;
alter table public.agent_test_sessions add column if not exists data_as_of timestamptz;
alter table public.agent_test_sessions add column if not exists provenance_summary jsonb not null default '{}'::jsonb;
alter table public.chat_messages add column if not exists as_of timestamptz;
alter table public.chat_messages add column if not exists provenance_summary jsonb not null default '{}'::jsonb;

create table if not exists public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  call_key text not null,
  tool_id text not null,
  tool_version text not null default 'catalog-v1',
  arguments jsonb not null default '{}'::jsonb,
  output_text text,
  output_checksum text,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check(status in ('completed','error')),
  error text,
  unique(agent_run_id,call_key)
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_call_id uuid not null references public.agent_tool_calls(id) on delete cascade,
  ref_index integer,
  source_label text,
  source_url text,
  as_of timestamptz,
  period_end date,
  field_path text,
  raw_value jsonb,
  normalized_value text,
  unit text,
  raw_excerpt text,
  created_at timestamptz not null default now()
);
create index if not exists evidence_run_ref on public.evidence_items(agent_run_id,ref_index);

create table if not exists public.output_claims (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  claim_index integer not null,
  claim_text text not null,
  numeric_values text[] not null default '{}',
  ref_indices integer[] not null default '{}',
  validation_status text not null check(validation_status in ('grounded','unlinked','invalid')),
  unique(agent_run_id,claim_index)
);

create table if not exists public.claim_evidence (
  claim_id uuid not null references public.output_claims(id) on delete cascade,
  evidence_id uuid not null references public.evidence_items(id) on delete cascade,
  primary key(claim_id,evidence_id)
);

alter table public.agent_tool_calls enable row level security;
alter table public.evidence_items enable row level security;
alter table public.output_claims enable row level security;
alter table public.claim_evidence enable row level security;

create policy own_tool_calls_read on public.agent_tool_calls for select using (
  exists(select 1 from public.agent_runs r where r.id=agent_run_id and r.user_id=auth.uid()));
create policy own_evidence_read on public.evidence_items for select using (
  exists(select 1 from public.agent_runs r where r.id=agent_run_id and r.user_id=auth.uid()));
create policy own_claims_read on public.output_claims for select using (
  exists(select 1 from public.agent_runs r where r.id=agent_run_id and r.user_id=auth.uid()));
create policy own_claim_evidence_read on public.claim_evidence for select using (
  exists(select 1 from public.output_claims c join public.agent_runs r on r.id=c.agent_run_id where c.id=claim_id and r.user_id=auth.uid()));
