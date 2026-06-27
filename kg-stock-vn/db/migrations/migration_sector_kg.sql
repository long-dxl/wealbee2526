-- ============================================================
-- MIGRATION: SECTOR-CENTRIC KNOWLEDGE GRAPH (Phase 1)
-- ------------------------------------------------------------
-- Chuyển KG sang "lấy NGÀNH làm trung tâm": vĩ mô (trong nước + quốc tế)
-- → NGÀNH → (× Beta) → cổ phiếu. An toàn chạy trên DB đã có dữ liệu.
-- Chạy trên Supabase SQL Editor SAU schema.sql + migration_temporal_kg.sql.
-- ============================================================


-- ── BƯỚC 1: Mở CHECK constraint cho STOCK (Top 10 → mọi mã VN30/HOSE) ──
-- Bỏ giới hạn cứng Top 10; cho phép mọi mã 2-4 ký tự chữ in hoa.
ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS chk_valid_entity;
ALTER TABLE graph_nodes ADD CONSTRAINT chk_valid_entity CHECK (
    (entity_type = 'STOCK' AND entity_id ~ '^[A-Z]{2,4}$')
    OR entity_type IN ('MACRO', 'NEWS', 'SECTOR', 'COMPANY_FACTOR')
);


-- ── BƯỚC 2: Thêm quan hệ phục vụ suy luận ngành × vĩ mô ──────
ALTER TABLE graph_edges DROP CONSTRAINT IF EXISTS chk_valid_relationship;
ALTER TABLE graph_edges ADD CONSTRAINT chk_valid_relationship CHECK (
    relationship_type IN (
        -- Bộ gốc
        'SUPPLIES_TO', 'INPUT_COST_OF', 'OUTPUT_PRODUCT_OF',
        'AFFECTS_NEGATIVE', 'AFFECTS_POSITIVE', 'MENTIONS',
        'CORRELATES_WITH', 'BELONGS_TO_SECTOR',
        -- FinDKG mở rộng
        'PARTNERS_WITH', 'COMPETES_WITH', 'INVESTS_IN', 'ACQUIRES',
        'PRODUCES', 'OPERATES_IN', 'INCREASES', 'DECREASES',
        -- Sector-centric (Phase 1)
        'TRANSMITS_TO',        -- vĩ mô → vĩ mô (chuỗi lan truyền)
        'DRIVES_DEMAND_OF',    -- vĩ mô → ngành (kéo cầu)
        'IS_INPUT_COST_OF'     -- vĩ mô/hàng hóa → ngành (chi phí đầu vào)
    )
);


-- ============================================================
-- BƯỚC 3: RPC get_sector_network(sector_id)
-- Trả về: node ngành + các yếu tố VĨ MÔ tác động (cạnh đến/đi) +
--         danh sách cổ phiếu thuộc ngành kèm Beta.
-- ============================================================
DROP FUNCTION IF EXISTS get_sector_network(TEXT);
CREATE OR REPLACE FUNCTION get_sector_network(sector_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    sector_node_id UUID;
    v_result JSONB;
BEGIN
    SELECT id INTO sector_node_id
    FROM graph_nodes
    WHERE entity_id = UPPER(sector_input) AND entity_type = 'SECTOR';

    IF sector_node_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Không tìm thấy ngành: ' || sector_input,
                                  'status', 'NOT_FOUND');
    END IF;

    SELECT jsonb_build_object(
        'sector', (SELECT jsonb_build_object('entity_id', entity_id, 'name', name,
                          'properties', properties)
                   FROM graph_nodes WHERE id = sector_node_id),
        -- Yếu tố vĩ mô tác động đến ngành (mọi cạnh nối tới node ngành)
        'macro_drivers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'macro',        other.entity_id,
                'macro_name',   other.name,
                'scope',        other.properties->>'scope',
                'relationship', e.relationship_type,
                'sign',         e.properties->>'sign',
                'weight',       e.properties->>'weight',
                'lag',          e.properties->>'lag',
                'mechanism',    e.properties->>'mechanism',
                'confidence',   e.confidence,
                'source',       e.source_url
            ) ORDER BY (e.properties->>'weight') DESC NULLS LAST)
            FROM graph_edges e
            JOIN graph_nodes other ON other.id = CASE WHEN e.source_id = sector_node_id
                                                      THEN e.target_id ELSE e.source_id END
            WHERE (e.source_id = sector_node_id OR e.target_id = sector_node_id)
              AND other.entity_type = 'MACRO'
        ), '[]'::jsonb),
        -- Cổ phiếu thuộc ngành + Beta
        'stocks', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'ticker',        s.entity_id,
                'name',          s.name,
                'beta_vnindex',  s.properties->>'beta_vnindex',
                'beta_sector',   s.properties->>'beta_sector'
            ) ORDER BY (s.properties->>'beta_vnindex') DESC NULLS LAST)
            FROM graph_edges e
            JOIN graph_nodes s ON s.id = e.source_id
            WHERE e.target_id = sector_node_id
              AND e.relationship_type = 'BELONGS_TO_SECTOR'
              AND s.entity_type = 'STOCK'
        ), '[]'::jsonb),
        'status', 'OK'
    ) INTO v_result;
    RETURN v_result;
END;
$$;


-- ============================================================
-- BƯỚC 4: RPC get_macro_propagation(macro_id)
-- Trả về: 1 cú sốc vĩ mô lan truyền tới đâu — vĩ mô hạ nguồn
-- (TRANSMITS_TO) + các NGÀNH chịu tác động (kèm dấu/trọng số).
-- ============================================================
DROP FUNCTION IF EXISTS get_macro_propagation(TEXT);
CREATE OR REPLACE FUNCTION get_macro_propagation(macro_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    macro_node_id UUID;
    v_result JSONB;
BEGIN
    SELECT id INTO macro_node_id
    FROM graph_nodes
    WHERE entity_id = UPPER(macro_input) AND entity_type = 'MACRO';

    IF macro_node_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Không tìm thấy yếu tố vĩ mô: ' || macro_input,
                                  'status', 'NOT_FOUND');
    END IF;

    SELECT jsonb_build_object(
        'macro', (SELECT jsonb_build_object('entity_id', entity_id, 'name', name,
                         'scope', properties->>'scope', 'properties', properties)
                  FROM graph_nodes WHERE id = macro_node_id),
        -- Vĩ mô hạ nguồn (chuỗi lan truyền)
        'transmits_to', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'to', tgt.entity_id, 'to_name', tgt.name,
                'sign', e.properties->>'sign', 'mechanism', e.properties->>'mechanism',
                'confidence', e.confidence, 'source', e.source_url))
            FROM graph_edges e JOIN graph_nodes tgt ON tgt.id = e.target_id
            WHERE e.source_id = macro_node_id AND e.relationship_type = 'TRANSMITS_TO'
        ), '[]'::jsonb),
        -- Ngành chịu tác động trực tiếp
        'affected_sectors', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'sector', sec.entity_id, 'sector_name', sec.name,
                'relationship', e.relationship_type,
                'sign', e.properties->>'sign', 'weight', e.properties->>'weight',
                'lag', e.properties->>'lag', 'mechanism', e.properties->>'mechanism',
                'confidence', e.confidence, 'source', e.source_url)
                ORDER BY (e.properties->>'weight') DESC NULLS LAST)
            FROM graph_edges e
            JOIN graph_nodes sec ON sec.id = CASE WHEN e.source_id = macro_node_id
                                                  THEN e.target_id ELSE e.source_id END
            WHERE (e.source_id = macro_node_id OR e.target_id = macro_node_id)
              AND sec.entity_type = 'SECTOR'
        ), '[]'::jsonb),
        'status', 'OK'
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ============================================================
-- KIỂM TRA SAU MIGRATION
-- ============================================================
-- SELECT * FROM get_sector_network('SECTOR_BANKING');
-- SELECT * FROM get_macro_propagation('LAI_SUAT_FED');
