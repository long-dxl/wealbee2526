-- Phase 3: Framework là artifact versioned, tách khỏi source code.
create table if not exists public.frameworks (
  id uuid primary key default gen_random_uuid(),
  framework_key text not null unique,
  name text not null,
  task_type text not null,
  company_type text not null default 'default',
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (task_type, company_type)
);

create table if not exists public.framework_versions (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','review','published','deprecated')),
  system_rules text not null,
  tool_policy jsonb not null default '{}'::jsonb,
  output_contract jsonb not null default '{}'::jsonb,
  eval_summary jsonb,
  checksum text not null,
  change_note text,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (framework_id, version)
);

create unique index if not exists framework_one_published
  on public.framework_versions(framework_id) where status = 'published';
create index if not exists framework_versions_lookup
  on public.framework_versions(framework_id, status, version desc);

create or replace function public.framework_set_checksum() returns trigger
language plpgsql as $$
begin
  new.checksum := md5(new.system_rules || new.tool_policy::text || new.output_contract::text);
  return new;
end $$;
drop trigger if exists framework_set_checksum on public.framework_versions;
create trigger framework_set_checksum before insert or update of system_rules,tool_policy,output_contract
on public.framework_versions for each row execute function public.framework_set_checksum();

alter table public.agents add column if not exists framework_id uuid references public.frameworks(id);
alter table public.agent_runs add column if not exists framework_version_id uuid references public.framework_versions(id);
alter table public.agent_runs add column if not exists framework_version text;
alter table public.agent_test_sessions add column if not exists framework_version_id uuid references public.framework_versions(id);
alter table public.chat_messages add column if not exists framework_version_id uuid references public.framework_versions(id);

create table if not exists public.framework_eval_cases (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  name text not null,
  input jsonb not null,
  assertions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(framework_id,name)
);
create table if not exists public.framework_eval_runs (
  id uuid primary key default gen_random_uuid(),
  framework_version_id uuid not null references public.framework_versions(id) on delete cascade,
  model text not null,
  status text not null default 'running' check (status in ('running','passed','failed','error')),
  passed integer not null default 0,
  failed integer not null default 0,
  total integer not null default 0,
  created_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);
create table if not exists public.framework_eval_results (
  id uuid primary key default gen_random_uuid(),
  eval_run_id uuid not null references public.framework_eval_runs(id) on delete cascade,
  eval_case_id uuid not null references public.framework_eval_cases(id) on delete cascade,
  passed boolean not null,
  score numeric(5,4) not null,
  output text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(eval_run_id,eval_case_id)
);

alter table public.frameworks enable row level security;
alter table public.framework_versions enable row level security;
alter table public.framework_eval_cases enable row level security;
alter table public.framework_eval_runs enable row level security;
alter table public.framework_eval_results enable row level security;

-- Nội dung framework không public. Chỉ expert trong app_metadata được quản trị;
-- Edge Functions dùng service_role để resolve runtime và bypass RLS.
create policy framework_expert_read on public.frameworks for select
  using ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert');
create policy framework_expert_insert on public.frameworks for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert');
create policy framework_expert_update on public.frameworks for update
  using ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert')
  with check ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert');
create policy framework_version_expert_read on public.framework_versions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert');
create policy framework_version_expert_insert on public.framework_versions for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert' and status in ('draft','review'));
create policy framework_version_expert_update on public.framework_versions for update
  using ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert' and status in ('draft','review'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert' and status in ('draft','review'));
create policy framework_eval_cases_expert on public.framework_eval_cases for all
  using ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert')
  with check ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert');
create policy framework_eval_runs_expert_read on public.framework_eval_runs for select
  using ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert');
create policy framework_eval_results_expert_read on public.framework_eval_results for select
  using ((auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert');

create or replace function public.framework_published_immutable() returns trigger
language plpgsql as $$
begin
  if old.status in ('published','deprecated') and current_setting('app.framework_governance', true) is distinct from 'on' then
    raise exception 'Published/deprecated framework versions are immutable';
  end if;
  return new;
end $$;
drop trigger if exists framework_published_immutable on public.framework_versions;
create trigger framework_published_immutable before update or delete on public.framework_versions
for each row execute function public.framework_published_immutable();

create or replace function public.is_framework_expert() returns boolean
language sql stable as $$ select (auth.jwt() -> 'app_metadata' ->> 'framework_role') = 'expert' $$;

create or replace function public.publish_framework_version(p_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_framework uuid; v_eval jsonb;
begin
  if not public.is_framework_expert() then raise exception 'framework expert required'; end if;
  perform set_config('app.framework_governance','on',true);
  select framework_id, eval_summary into v_framework, v_eval
    from framework_versions where id = p_version_id and status = 'review' for update;
  if v_framework is null then raise exception 'version must be in review'; end if;
  if coalesce((v_eval->>'passed')::boolean, false) is not true then raise exception 'eval gate not passed'; end if;
  update framework_versions set status = 'deprecated' where framework_id = v_framework and status = 'published';
  update framework_versions set status = 'published', published_at = now(), reviewed_by = auth.uid() where id = p_version_id;
end $$;

create or replace function public.rollback_framework_version(p_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_framework uuid;
begin
  if not public.is_framework_expert() then raise exception 'framework expert required'; end if;
  perform set_config('app.framework_governance','on',true);
  select framework_id into v_framework from framework_versions where id = p_version_id and status = 'deprecated';
  if v_framework is null then raise exception 'rollback target must be deprecated'; end if;
  update framework_versions set status = 'deprecated' where framework_id = v_framework and status = 'published';
  -- Trigger bất biến không cho update deprecated trực tiếp; rollback tạo bản copy mới.
  insert into framework_versions(framework_id, version, status, system_rules, tool_policy, output_contract, eval_summary, checksum, change_note, created_by, reviewed_by, published_at)
  select framework_id,
         (select coalesce(max(version),0)+1 from framework_versions where framework_id=v_framework),
         'published', system_rules, tool_policy, output_contract, eval_summary, checksum,
         'Rollback from v' || version, auth.uid(), auth.uid(), now()
  from framework_versions where id = p_version_id;
end $$;

-- Seed v1: nội dung chỉ tồn tại trong migration/DB bootstrap, runtime source không chứa framework.
insert into public.frameworks(framework_key,name,task_type,company_type,description)
values
 ('daily_digest.default','Daily Digest','daily_digest','default','Bản tin thị trường có nguồn'),
 ('deep_research.default','Deep Research','deep_research','default','Phân tích doanh nghiệp có nguồn'),
 ('default.default','Default Agent','default','default','Framework an toàn mặc định')
on conflict (framework_key) do nothing;

with seed(framework_key, rules, tools, output) as (values
 ('daily_digest.default', $rules$Chỉ sử dụng dữ liệu trong NGUỒN DỮ LIỆU. Không dùng số từ kiến thức nền. Mọi số liệu phải có [ref:N]. Không khuyến nghị mua/bán. Cho phép HTML inline chỉ để tô màu.$rules$,
  '{"required":["news_feed","price_feed"],"optional":["portfolio_read","macro"]}'::jsonb,
  '{"format":"markdown_color","citation_required":true,"legal_disclaimer":true,"unlinked_claim_policy":"warn"}'::jsonb),
 ('deep_research.default', $rules$Chỉ sử dụng dữ liệu trong NGUỒN DỮ LIỆU. Không ước tính hoặc nội suy. Mọi số liệu phải có [ref:N]. Giữ nguyên bảng nguồn. Không khuyến nghị mua/bán.$rules$,
  '{"required":["financials"],"optional":["news_feed","insider_trades","value_chain","analyst_reports","kb_search"]}'::jsonb,
  '{"format":"markdown","citation_required":true,"legal_disclaimer":true,"unlinked_claim_policy":"warn"}'::jsonb),
 ('default.default', $rules$Chỉ sử dụng dữ liệu được tool cung cấp. Nếu thiếu dữ liệu phải nói rõ. Mọi số liệu phải có [ref:N]. Không khuyến nghị mua/bán.$rules$,
  '{"required":[],"optional":[]}'::jsonb,
  '{"format":"markdown","citation_required":true,"legal_disclaimer":true,"unlinked_claim_policy":"warn"}'::jsonb)
)
insert into public.framework_versions(framework_id,version,status,system_rules,tool_policy,output_contract,eval_summary,checksum,change_note,published_at)
select f.id,1,'published',s.rules,s.tools,s.output,'{"passed":true,"seed":true}'::jsonb,
       md5(s.rules || s.tools::text || s.output::text),'Initial migration from code',now()
from seed s join public.frameworks f using(framework_key)
where not exists (select 1 from public.framework_versions v where v.framework_id=f.id);

insert into public.framework_eval_cases(framework_id,name,input,assertions)
select f.id,'grounding-smoke',
       '{"system_prompt":"Phân tích dữ liệu được cung cấp","data_context":"ROE mẫu là 18% [ref:1].","user_prompt":"Tóm tắt ROE mẫu."}'::jsonb,
       '{"required_strings":["ROE"],"citation_required":true,"legal_disclaimer":true,"min_length":30}'::jsonb
from public.frameworks f
on conflict(framework_id,name) do nothing;
