-- ============================================================
-- MIGRATION: TEMPORAL KNOWLEDGE GRAPH (lấy cảm hứng từ FinDKG)
-- ------------------------------------------------------------
-- Nâng cấp graph_edges từ đồ thị TĨNH → đồ thị ĐỘNG có thời gian.
-- An toàn để chạy trên DB đã có dữ liệu (idempotent, additive).
-- Chạy trực tiếp trên Supabase SQL Editor SAU schema.sql.
--
-- Mục tiêu Sprint 1:
--   1. Mỗi cạnh có dấu thời gian (observed_at) → graph thay đổi theo thời gian
--   2. Mỗi cạnh sinh từ tin tức PHẢI có nguồn (source_url) + bằng chứng
--      (evidence_quote) → nền tảng chống hallucination
--   3. confidence [0..1] để lọc nhiễu
--   4. data_source phân biệt: 'expert_seed' | 'macro_logic' | 'news'
--   5. Mở rộng bộ quan hệ theo schema FinDKG
-- ============================================================


-- ── BƯỚC 1: Thêm các cột thời gian / nguồn / độ tin cậy ──────
-- ADD COLUMN IF NOT EXISTS → chạy lại nhiều lần không lỗi.
ALTER TABLE graph_edges
    ADD COLUMN IF NOT EXISTS observed_at    TIMESTAMPTZ,   -- thời điểm quan hệ được quan sát (ngày đăng tin)
    ADD COLUMN IF NOT EXISTS valid_from     TIMESTAMPTZ,   -- bắt đầu có hiệu lực
    ADD COLUMN IF NOT EXISTS valid_to       TIMESTAMPTZ,   -- hết hiệu lực (NULL = còn hiệu lực)
    ADD COLUMN IF NOT EXISTS confidence     NUMERIC(3,2),  -- độ tin cậy [0.00 .. 1.00]
    ADD COLUMN IF NOT EXISTS source_url     TEXT,          -- link bài gốc (BẮT BUỘC với cạnh 'news')
    ADD COLUMN IF NOT EXISTS evidence_quote TEXT,          -- câu nguyên văn làm bằng chứng
    ADD COLUMN IF NOT EXISTS data_source    TEXT;          -- 'expert_seed' | 'macro_logic' | 'news'


-- ── BƯỚC 2: Ràng buộc giá trị confidence và data_source ──────
ALTER TABLE graph_edges DROP CONSTRAINT IF EXISTS chk_confidence_range;
ALTER TABLE graph_edges ADD CONSTRAINT chk_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

ALTER TABLE graph_edges DROP CONSTRAINT IF EXISTS chk_data_source;
ALTER TABLE graph_edges ADD CONSTRAINT chk_data_source
    CHECK (data_source IS NULL OR data_source IN ('expert_seed', 'macro_logic', 'news'));


-- ── BƯỚC 3: Mở rộng bộ quan hệ theo FinDKG ──────────────────
-- Các edge cũ dùng 8 quan hệ ban đầu → vẫn là tập con hợp lệ.
ALTER TABLE graph_edges DROP CONSTRAINT IF EXISTS chk_valid_relationship;
ALTER TABLE graph_edges ADD CONSTRAINT chk_valid_relationship CHECK (
    relationship_type IN (
        -- Bộ gốc (giữ nguyên tương thích)
        'SUPPLIES_TO',
        'INPUT_COST_OF',
        'OUTPUT_PRODUCT_OF',
        'AFFECTS_NEGATIVE',
        'AFFECTS_POSITIVE',
        'MENTIONS',
        'CORRELATES_WITH',
        'BELONGS_TO_SECTOR',
        -- Bộ mở rộng theo FinDKG (open information extraction)
        'PARTNERS_WITH',       -- hợp tác / liên doanh
        'COMPETES_WITH',       -- cạnh tranh
        'INVESTS_IN',          -- đầu tư vào
        'ACQUIRES',            -- thâu tóm / M&A
        'PRODUCES',            -- sản xuất / cung cấp sản phẩm
        'OPERATES_IN',         -- hoạt động trong (ngành/quốc gia)
        'INCREASES',           -- làm tăng (chỉ số/giá)
        'DECREASES'            -- làm giảm (chỉ số/giá)
    )
);


-- ── BƯỚC 4: Index phục vụ truy vấn theo thời gian (Feature 2) ─
CREATE INDEX IF NOT EXISTS idx_graph_edges_observed_at
    ON graph_edges(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_edges_data_source
    ON graph_edges(data_source);


-- ── BƯỚC 5: Backfill dữ liệu cũ ─────────────────────────────
-- Các cạnh đã tồn tại trước migration được coi là tri thức chuyên gia.
UPDATE graph_edges
SET data_source = 'expert_seed',
    observed_at = COALESCE(observed_at, created_at),
    confidence  = COALESCE(confidence, (properties->>'weight')::NUMERIC)
WHERE data_source IS NULL;


-- ============================================================
-- BƯỚC 6: NÂNG CẤP RPC get_financial_network
-- ------------------------------------------------------------
-- Bổ sung:
--   - Trả kèm observed_at, confidence, source_url, evidence_quote,
--     data_source cho mỗi cạnh → Agent có thể trích nguồn (no hallucination)
--   - Tham số max_age_days (mặc định NULL = không lọc): khi đặt, các cạnh
--     'news' cũ hơn N ngày sẽ bị loại; cạnh cấu trúc (expert_seed/macro_logic)
--     LUÔN được giữ vì là tri thức nền không phụ thuộc thời điểm.
--   - min_confidence (mặc định 0): lọc cạnh độ tin cậy thấp.
-- Chữ ký cũ get_financial_network(ticker) VẪN gọi được nhờ tham số mặc định.
-- ============================================================
DROP FUNCTION IF EXISTS get_financial_network(TEXT);
DROP FUNCTION IF EXISTS get_financial_network(TEXT, INT, NUMERIC);

CREATE OR REPLACE FUNCTION get_financial_network(
    ticker_input   TEXT,
    max_age_days   INT     DEFAULT NULL,   -- NULL = lấy tất cả; vd 90 = chỉ tin ≤ 90 ngày
    min_confidence NUMERIC DEFAULT 0       -- lọc cạnh có confidence < ngưỡng
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    center_node_id  UUID;
    v_result        JSONB;
    hop1_node_ids   UUID[];
    all_node_ids    UUID[];
    cutoff_ts       TIMESTAMPTZ;
BEGIN
    -- Ngưỡng thời gian (nếu có)
    IF max_age_days IS NOT NULL THEN
        cutoff_ts := NOW() - (max_age_days || ' days')::INTERVAL;
    END IF;

    -- Bước 1: Tìm node trung tâm
    SELECT id INTO center_node_id
    FROM graph_nodes
    WHERE entity_id = UPPER(ticker_input) AND entity_type = 'STOCK';

    IF center_node_id IS NULL THEN
        RETURN jsonb_build_object(
            'error',  'Không tìm thấy mã cổ phiếu: ' || ticker_input,
            'ticker', UPPER(ticker_input),
            'status', 'NOT_FOUND'
        );
    END IF;

    -- Bước 2: Hop-1 (chỉ qua các cạnh thoả điều kiện thời gian + độ tin cậy)
    SELECT ARRAY_AGG(DISTINCT connected_id)
    INTO hop1_node_ids
    FROM (
        SELECT target_id AS connected_id FROM graph_edges e
            WHERE e.source_id = center_node_id
              AND (max_age_days IS NULL OR e.data_source <> 'news' OR e.observed_at >= cutoff_ts)
              AND COALESCE(e.confidence, 1) >= min_confidence
        UNION
        SELECT source_id AS connected_id FROM graph_edges e
            WHERE e.target_id = center_node_id
              AND (max_age_days IS NULL OR e.data_source <> 'news' OR e.observed_at >= cutoff_ts)
              AND COALESCE(e.confidence, 1) >= min_confidence
    ) AS neighbors
    WHERE connected_id IS NOT NULL;

    IF hop1_node_ids IS NULL THEN
        hop1_node_ids := ARRAY[]::UUID[];
    END IF;

    -- Bước 3: Gộp center + hop1 + hop2
    SELECT ARRAY_AGG(DISTINCT all_id)
    INTO all_node_ids
    FROM (
        SELECT center_node_id AS all_id
        UNION SELECT UNNEST(hop1_node_ids)
        UNION SELECT target_id FROM graph_edges
            WHERE source_id = ANY(hop1_node_ids) AND target_id <> center_node_id
        UNION SELECT source_id FROM graph_edges
            WHERE target_id = ANY(hop1_node_ids) AND source_id <> center_node_id
    ) AS all_nodes
    WHERE all_id IS NOT NULL;

    -- Bước 4: Xây JSON kết quả
    SELECT jsonb_build_object(
        'center_node', (
            SELECT jsonb_build_object(
                'entity_id', entity_id, 'entity_type', entity_type,
                'name', name, 'properties', properties
            )
            FROM graph_nodes WHERE id = center_node_id
        ),
        'network_nodes', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'entity_id', n.entity_id, 'entity_type', n.entity_type,
                    'name', n.name, 'properties', n.properties,
                    'hop', CASE WHEN n.id = center_node_id THEN 0
                                WHEN n.id = ANY(hop1_node_ids) THEN 1 ELSE 2 END
                )
                ORDER BY CASE WHEN n.id = center_node_id THEN 0
                              WHEN n.id = ANY(hop1_node_ids) THEN 1 ELSE 2 END,
                         n.entity_type, n.entity_id
            )
            FROM graph_nodes n WHERE n.id = ANY(all_node_ids)
        ),
        -- Cạnh kèm metadata thời gian + nguồn (cho Agent trích dẫn)
        'network_edges', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'from',           src.entity_id,
                    'to',             tgt.entity_id,
                    'relationship',   e.relationship_type,
                    'confidence',     e.confidence,
                    'observed_at',    e.observed_at,
                    'data_source',    e.data_source,
                    'source_url',     e.source_url,
                    'evidence_quote', e.evidence_quote,
                    'properties',     e.properties
                )
                ORDER BY e.observed_at DESC NULLS LAST, e.relationship_type
            )
            FROM graph_edges e
            JOIN graph_nodes src ON e.source_id = src.id
            JOIN graph_nodes tgt ON e.target_id = tgt.id
            WHERE e.source_id = ANY(all_node_ids)
              AND e.target_id = ANY(all_node_ids)
              AND (max_age_days IS NULL OR e.data_source <> 'news' OR e.observed_at >= cutoff_ts)
              AND COALESCE(e.confidence, 1) >= min_confidence
        ),
        'summary', jsonb_build_object(
            'ticker',          UPPER(ticker_input),
            'total_nodes',     COALESCE(array_length(all_node_ids, 1), 0),
            'hop1_count',      COALESCE(array_length(hop1_node_ids, 1), 0),
            'max_age_days',    max_age_days,
            'min_confidence',  min_confidence,
            'query_timestamp', NOW()::TEXT
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;


-- ============================================================
-- BƯỚC 7: RPC mới get_stock_timeline (phục vụ Feature 2)
-- ------------------------------------------------------------
-- Trả về dòng thời gian các sự kiện/quan hệ động (từ tin tức) của 1 mã,
-- sắp xếp mới → cũ, kèm nguồn + bằng chứng để nhà đầu tư tự kiểm chứng.
-- ============================================================
DROP FUNCTION IF EXISTS get_stock_timeline(TEXT, INT);

CREATE OR REPLACE FUNCTION get_stock_timeline(
    ticker_input TEXT,
    days_back    INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    stock_id  UUID;
    v_result  JSONB;
    cutoff_ts TIMESTAMPTZ := NOW() - (days_back || ' days')::INTERVAL;
BEGIN
    SELECT id INTO stock_id
    FROM graph_nodes
    WHERE entity_id = UPPER(ticker_input) AND entity_type = 'STOCK';

    IF stock_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Không tìm thấy mã: ' || ticker_input,
                                  'status', 'NOT_FOUND');
    END IF;

    SELECT jsonb_build_object(
        'ticker',    UPPER(ticker_input),
        'days_back', days_back,
        'events', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'observed_at',    e.observed_at,
                    'relationship',   e.relationship_type,
                    'counterpart',    other.entity_id,
                    'counterpart_name', other.name,
                    'confidence',     e.confidence,
                    'source_url',     e.source_url,
                    'evidence_quote', e.evidence_quote,
                    'properties',     e.properties
                )
                ORDER BY e.observed_at DESC NULLS LAST
            )
            FROM graph_edges e
            JOIN graph_nodes other
                 ON other.id = CASE WHEN e.source_id = stock_id THEN e.target_id ELSE e.source_id END
            WHERE (e.source_id = stock_id OR e.target_id = stock_id)
              AND e.data_source = 'news'
              AND e.observed_at >= cutoff_ts
        ), '[]'::jsonb),
        'status', 'OK'
    ) INTO v_result;

    RETURN v_result;
END;
$$;


-- ============================================================
-- KIỂM TRA SAU MIGRATION
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'graph_edges' ORDER BY ordinal_position;
-- SELECT * FROM get_financial_network('HPG');              -- tương thích cũ
-- SELECT * FROM get_financial_network('HPG', 90, 0.5);     -- lọc 90 ngày, conf ≥ 0.5
-- SELECT * FROM get_stock_timeline('FPT', 90);             -- timeline Feature 2
