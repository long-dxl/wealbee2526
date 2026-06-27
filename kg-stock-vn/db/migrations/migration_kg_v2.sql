-- ============================================================
-- migration_kg_v2.sql — KIẾN TRÚC KNOWLEDGE GRAPH v2 (event-centric)
-- ------------------------------------------------------------
-- Mục tiêu: scale tới hàng nghìn mã + triệu tin, multi-agent, GraphRAG-ready.
-- Phân lớp: L1 Document · L2 Entity (Attribute Graph) · L3 Event Graph · L4 Taxonomy · L5 Serving.
-- Chạy 1 lần trên Supabase SQL Editor. Idempotent (IF NOT EXISTS).
-- KHÔNG xóa schema cũ (graph_nodes/edges/news_articles vẫn chạy song song trong giai đoạn migrate).
-- ============================================================

create extension if not exists vector;      -- pgvector cho semantic / GraphRAG

-- ============================================================
-- L4 — TAXONOMY (controlled vocabulary)
-- ============================================================

-- Phân ngành: ICB làm GỐC + cột map sang VSIC (VN) & GICS (quốc tế)
create table if not exists industry_taxonomy (
    code         text primary key,          -- mã ICB, vd '8350'
    name_vi      text not null,
    name_en      text,
    level        int,                        -- 1 Industry · 2 Supersector · 3 Sector · 4 Subsector
    parent_code  text references industry_taxonomy(code),
    vsic_code    text,                       -- map chuẩn nhà nước VN
    gics_code    text,                       -- map chuẩn quốc tế (mở rộng sau)
    created_at   timestamptz default now()
);

-- Phân loại SỰ KIỆN (phân cấp). category gom nhóm lớn cho agent routing.
create table if not exists event_taxonomy (
    code             text primary key,       -- vd 'MA.ACQUISITION', 'EARN.RESULT', 'CAPITAL.ESOP'
    name_vi          text not null,
    name_en          text,
    category         text,                   -- CORPORATE/EARNINGS/CAPITAL/GOVERNANCE/MA/REGULATORY/MACRO/MARKET/SECTOR/RATING/RISK
    parent_code      text references event_taxonomy(code),
    default_polarity text,                   -- POSITIVE/NEGATIVE/NEUTRAL/CONTEXT (gợi ý, model vẫn tự đánh giá)
    description      text
);

-- ============================================================
-- L2 — ENTITY MASTER (Attribute Graph: thực thể ỔN ĐỊNH)
-- ============================================================
create table if not exists entities (
    entity_id      text primary key,         -- canonical, vd 'CO_FPT','IND_8350','MAC_USDVND','COM_HRC'
    entity_type    text not null,            -- COMPANY/SECURITY/SECTOR/INDUSTRY/MACRO/COMMODITY/PERSON/REGULATOR/COUNTRY/PRODUCT
    canonical_name text not null,
    aliases        text[] default '{}',      -- 'Hòa Phát','HPG','Hoa Phat Group' → 1 entity
    ticker         text,
    exchange       text,                     -- HOSE/HNX/UPCOM (mở rộng: NYSE/NASDAQ...)
    isin           text,
    lei            text,
    industry_code  text references industry_taxonomy(code),
    country        text default 'VN',
    attributes     jsonb default '{}',       -- vốn hóa, beta, mô tả... (ổn định, cập nhật chậm)
    status         text default 'active',
    valid_from     timestamptz,
    valid_to       timestamptz,
    embedding      vector(768),              -- semantic entity search (Phase 2)
    created_at     timestamptz default now(),
    updated_at     timestamptz default now()
);
create index if not exists idx_entities_type     on entities(entity_type);
create index if not exists idx_entities_ticker    on entities(ticker);
create index if not exists idx_entities_industry  on entities(industry_code);
create index if not exists idx_entities_aliases   on entities using gin(aliases);
create index if not exists idx_entities_attrs     on entities using gin(attributes);

-- Cạnh CẤU TRÚC (chậm đổi): ngành, công ty con, chuỗi cung ứng, cạnh tranh, chứng khoán↔issuer
create table if not exists entity_relations (
    id          bigint generated always as identity primary key,
    source_id   text not null references entities(entity_id) on delete cascade,
    target_id   text not null references entities(entity_id) on delete cascade,
    rel_type    text not null,               -- BELONGS_TO_INDUSTRY/SUBSIDIARY_OF/SUPPLIES_TO/COMPETES_WITH/
                                             -- ISSUED_BY/OPERATES_IN/INPUT_COST_OF/OUTPUT_PRODUCT_OF/PEER_OF/AFFECTS
    weight      real,
    confidence  real,
    sign        text,                        -- '+'/'-' cho quan hệ nhân quả cấu trúc (vĩ mô→ngành)
    properties  jsonb default '{}',
    valid_from  timestamptz,
    valid_to    timestamptz,
    data_source text,                        -- expert_seed/derived/news
    created_at  timestamptz default now(),
    constraint uq_entity_rel unique (source_id, target_id, rel_type),
    constraint chk_no_self_rel check (source_id <> target_id)
);
create index if not exists idx_erel_source on entity_relations(source_id, rel_type);
create index if not exists idx_erel_target on entity_relations(target_id, rel_type);

-- ============================================================
-- L3 — EVENT GRAPH (sự kiện hạng nhất — DEDUPE nhiều bài về 1 sự kiện)
-- ============================================================
create table if not exists events (
    event_id           bigint generated always as identity primary key,
    event_uid          text unique,          -- hash(type + chủ thể + ngày) để dedupe
    event_type         text references event_taxonomy(code),
    scope              text,                 -- macro/sector/company
    title              text not null,
    summary            text,
    occurred_at        timestamptz,
    detected_at        timestamptz default now(),
    sentiment          text,                 -- POSITIVE/NEGATIVE/NEUTRAL
    materiality        real,                 -- 0..1 mức trọng yếu (lọc nhiễu cho agent)
    confidence         real,
    source_article_ids bigint[] default '{}',-- liên kết các bài nguồn (L1)
    primary_source_url text,
    evidence_quote     text,
    embedding          vector(768),          -- semantic event retrieval (Phase 2)
    properties         jsonb default '{}',
    created_at         timestamptz default now()
);
create index if not exists idx_events_type     on events(event_type);
create index if not exists idx_events_occurred  on events(occurred_at desc);
create index if not exists idx_events_scope     on events(scope, occurred_at desc);

-- Ai tham gia sự kiện (event → entity + vai trò)
create table if not exists event_participants (
    id        bigint generated always as identity primary key,
    event_id  bigint not null references events(event_id) on delete cascade,
    entity_id text not null references entities(entity_id) on delete cascade,
    role      text,                          -- SUBJECT/OBJECT/ACQUIRER/TARGET/ISSUER/PARTNER/REGULATOR/AFFECTED
    constraint uq_evt_part unique (event_id, entity_id, role)
);
create index if not exists idx_epart_entity on event_participants(entity_id);
create index if not exists idx_epart_event  on event_participants(event_id);

-- Tác động sự kiện lên thực thể (thay AFFECTS news cũ — ở cấp EVENT, đã dedupe)
create table if not exists event_impacts (
    id         bigint generated always as identity primary key,
    event_id   bigint not null references events(event_id) on delete cascade,
    entity_id  text not null references entities(entity_id) on delete cascade,  -- stock/ngành/vĩ mô chịu tác động
    direction  text,                         -- POSITIVE/NEGATIVE
    strength   real,                         -- 0..1
    horizon    text,                         -- INTRADAY/SHORT/MEDIUM/LONG
    mechanism  text,
    confidence real,
    created_at timestamptz default now()
);
create index if not exists idx_eimpact_entity on event_impacts(entity_id, direction);
create index if not exists idx_eimpact_event  on event_impacts(event_id);

-- Nhân quả sự kiện → sự kiện (Fed tăng lãi → VND giảm → biên XK giảm)
create table if not exists event_causality (
    id              bigint generated always as identity primary key,
    cause_event_id  bigint not null references events(event_id) on delete cascade,
    effect_event_id bigint not null references events(event_id) on delete cascade,
    confidence      real,
    mechanism       text,
    created_at      timestamptz default now(),
    constraint chk_no_self_cause check (cause_event_id <> effect_event_id)
);

-- ============================================================
-- L1 — DOCUMENT: bổ sung embedding + liên kết event cho news_articles
-- ============================================================
alter table news_articles add column if not exists embedding vector(768);
alter table news_articles add column if not exists event_id  bigint references events(event_id);
alter table news_articles add column if not exists entity_id text;   -- canonical entity (sau resolution)
create index if not exists idx_news_event on news_articles(event_id);

comment on table entities    is 'L2 Entity master (Attribute Graph) — thực thể ổn định, canonical + aliases + identifiers.';
comment on table events      is 'L3 Event Graph — sự kiện hạng nhất, dedupe nhiều bài, có tác động & nhân quả.';
comment on table event_impacts is 'Tác động sự kiện → cổ phiếu/ngành/vĩ mô (thay AFFECTS news cấp bài).';
