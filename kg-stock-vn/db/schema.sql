-- ============================================================
-- KNOWLEDGE GRAPH SCHEMA - TOP 10 CỔ PHIẾU VIỆT NAM
-- Chạy file này trực tiếp trên Supabase SQL Editor
-- Phiên bản: 1.0 | Dự án: kg-stock-vn (thử nghiệm độc lập)
-- ============================================================

-- ============================================================
-- BẢNG 1: graph_nodes - Lưu trữ các thực thể trong đồ thị
-- Bao gồm: cổ phiếu, chỉ số vĩ mô, tin tức, ngành
-- ============================================================
CREATE TABLE IF NOT EXISTS graph_nodes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id   TEXT NOT NULL UNIQUE,   -- Mã định danh duy nhất, ví dụ: "HPG", "LAI_SUAT_FED"
    entity_type TEXT NOT NULL,           -- Loại thực thể: STOCK | MACRO | NEWS | SECTOR
    name        TEXT NOT NULL,           -- Tên đầy đủ, ví dụ: "Hòa Phát Group"
    properties  JSONB DEFAULT '{}',      -- Thuộc tính linh hoạt: chỉ số tài chính, metadata...
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),

    -- ----------------------------------------------------------------
    -- CHECK CONSTRAINT: Giới hạn dữ liệu thử nghiệm
    -- Chỉ chấp nhận 10 mã cổ phiếu mục tiêu HOẶC các nút vĩ mô/tin tức
    -- liên quan trực tiếp đến chúng (entity_type khác STOCK)
    -- ----------------------------------------------------------------
    CONSTRAINT chk_valid_entity CHECK (
        -- Nếu là cổ phiếu (STOCK), phải thuộc Top 10
        (entity_type = 'STOCK' AND entity_id IN (
            'HPG',  -- Hòa Phát Group (Thép)
            'VHM',  -- Vinhomes (Bất động sản)
            'VIC',  -- Vingroup (Bất động sản)
            'VCB',  -- Vietcombank (Ngân hàng)
            'TCB',  -- Techcombank (Ngân hàng)
            'BID',  -- BIDV (Ngân hàng)
            'MSN',  -- Masan Group (Bán lẻ/Tiêu dùng)
            'VNM',  -- Vinamilk (Tiêu dùng)
            'MWG',  -- Mobile World (Bán lẻ)
            'FPT'   -- FPT Corp (Công nghệ)
        ))
        OR
        -- Nếu không phải STOCK (vĩ mô, tin tức, ngành) thì được phép tự do
        entity_type IN ('MACRO', 'NEWS', 'SECTOR', 'COMPANY_FACTOR')
    )
);

-- Index tăng tốc truy vấn theo entity_type và entity_id
CREATE INDEX IF NOT EXISTS idx_graph_nodes_entity_type ON graph_nodes(entity_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_entity_id   ON graph_nodes(entity_id);
-- Index GIN cho tìm kiếm trong cột JSONB properties
CREATE INDEX IF NOT EXISTS idx_graph_nodes_properties  ON graph_nodes USING GIN(properties);

-- Trigger tự động cập nhật updated_at khi có thay đổi
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_graph_nodes_updated_at
    BEFORE UPDATE ON graph_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- BẢNG 2: graph_edges - Lưu các mối quan hệ tài chính giữa nodes
-- Các loại quan hệ được hỗ trợ:
--   SUPPLIES_TO          : Cung cấp nguyên liệu/dịch vụ đến
--   INPUT_COST_OF        : Là chi phí đầu vào của
--   OUTPUT_PRODUCT_OF    : Là sản phẩm đầu ra của
--   AFFECTS_NEGATIVE     : Tác động tiêu cực đến (vĩ mô → cổ phiếu)
--   AFFECTS_POSITIVE     : Tác động tích cực đến
--   MENTIONS             : Tin tức đề cập đến (news → stock)
--   CORRELATES_WITH      : Có tương quan với
--   BELONGS_TO_SECTOR    : Thuộc ngành
-- ============================================================
CREATE TABLE IF NOT EXISTS graph_edges (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id         UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_id         UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    -- Thuộc tính của mối quan hệ: trọng số, độ tin cậy, nguồn dữ liệu, ngày hiệu lực...
    properties        JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),

    -- Ràng buộc: Loại quan hệ phải hợp lệ
    CONSTRAINT chk_valid_relationship CHECK (
        relationship_type IN (
            'SUPPLIES_TO',
            'INPUT_COST_OF',
            'OUTPUT_PRODUCT_OF',
            'AFFECTS_NEGATIVE',
            'AFFECTS_POSITIVE',
            'MENTIONS',
            'CORRELATES_WITH',
            'BELONGS_TO_SECTOR'
        )
    ),
    -- Không cho phép một node tự liên kết với chính nó
    CONSTRAINT chk_no_self_loop CHECK (source_id <> target_id)
);

-- Index tăng tốc truy vấn đồ thị (tìm kiếm từ source hoặc target)
CREATE INDEX IF NOT EXISTS idx_graph_edges_source       ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target       ON graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_rel_type     ON graph_edges(relationship_type);
-- Index GIN cho tìm kiếm trong properties của edge
CREATE INDEX IF NOT EXISTS idx_graph_edges_properties   ON graph_edges USING GIN(properties);

-- Trigger updated_at cho edges
CREATE TRIGGER trigger_graph_edges_updated_at
    BEFORE UPDATE ON graph_edges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- STORED PROCEDURE (RPC): get_financial_network
-- Mô tả: Trả về toàn bộ mạng lưới quan hệ trong 2 bước nhảy (2-hop)
--        xung quanh một mã cổ phiếu đầu vào
-- Đầu vào: ticker_input TEXT - ví dụ 'HPG', 'VCB'
-- Đầu ra : JSONB gồm:
--   - center_node  : Thông tin node trung tâm
--   - hop1_nodes   : Danh sách node láng giềng bước 1
--   - hop2_nodes   : Danh sách node láng giềng bước 2
--   - edges        : Tất cả cạnh kết nối trong phạm vi 2-hop
--   - summary      : Thống kê tóm tắt
-- ============================================================
CREATE OR REPLACE FUNCTION get_financial_network(ticker_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE  -- Không thay đổi dữ liệu, có thể cache kết quả
AS $$
DECLARE
    center_node_id  UUID;
    v_result        JSONB;
    hop1_node_ids   UUID[];
    all_node_ids    UUID[];
BEGIN
    -- Bước 1: Tìm node trung tâm từ ticker đầu vào
    SELECT id INTO center_node_id
    FROM graph_nodes
    WHERE entity_id = UPPER(ticker_input)
      AND entity_type = 'STOCK';

    -- Nếu không tìm thấy mã cổ phiếu, trả về thông báo lỗi
    IF center_node_id IS NULL THEN
        RETURN jsonb_build_object(
            'error',   'Không tìm thấy mã cổ phiếu: ' || ticker_input,
            'ticker',  UPPER(ticker_input),
            'status',  'NOT_FOUND'
        );
    END IF;

    -- Bước 2: Lấy tất cả nodes ở bước nhảy 1 (trực tiếp kết nối)
    SELECT ARRAY_AGG(DISTINCT connected_id)
    INTO hop1_node_ids
    FROM (
        SELECT target_id AS connected_id FROM graph_edges WHERE source_id = center_node_id
        UNION
        SELECT source_id AS connected_id FROM graph_edges WHERE target_id = center_node_id
    ) AS neighbors
    WHERE connected_id IS NOT NULL;

    -- Xử lý trường hợp không có láng giềng
    IF hop1_node_ids IS NULL THEN
        hop1_node_ids := ARRAY[]::UUID[];
    END IF;

    -- Bước 3: Gộp tất cả node IDs liên quan (center + hop1 + hop2)
    SELECT ARRAY_AGG(DISTINCT all_id)
    INTO all_node_ids
    FROM (
        -- Node trung tâm
        SELECT center_node_id AS all_id
        UNION
        -- Các node hop-1
        SELECT UNNEST(hop1_node_ids)
        UNION
        -- Các node hop-2 (láng giềng của láng giềng)
        SELECT target_id AS all_id FROM graph_edges
            WHERE source_id = ANY(hop1_node_ids) AND target_id <> center_node_id
        UNION
        SELECT source_id AS all_id FROM graph_edges
            WHERE target_id = ANY(hop1_node_ids) AND source_id <> center_node_id
    ) AS all_nodes
    WHERE all_id IS NOT NULL;

    -- Bước 4: Xây dựng kết quả JSON đầy đủ cho Gemini
    SELECT jsonb_build_object(
        -- Node trung tâm (cổ phiếu được hỏi)
        'center_node', (
            SELECT jsonb_build_object(
                'entity_id',   entity_id,
                'entity_type', entity_type,
                'name',        name,
                'properties',  properties
            )
            FROM graph_nodes WHERE id = center_node_id
        ),

        -- Tất cả nodes trong mạng lưới 2-hop
        'network_nodes', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'entity_id',   n.entity_id,
                    'entity_type', n.entity_type,
                    'name',        n.name,
                    'properties',  n.properties,
                    'hop',         CASE
                                       WHEN n.id = center_node_id THEN 0
                                       WHEN n.id = ANY(hop1_node_ids) THEN 1
                                       ELSE 2
                                   END
                )
                ORDER BY
                    CASE WHEN n.id = center_node_id THEN 0
                         WHEN n.id = ANY(hop1_node_ids) THEN 1
                         ELSE 2 END,
                    n.entity_type,
                    n.entity_id
            )
            FROM graph_nodes n
            WHERE n.id = ANY(all_node_ids)
        ),

        -- Tất cả cạnh kết nối trong mạng lưới
        'network_edges', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'from',               src.entity_id,
                    'to',                 tgt.entity_id,
                    'relationship',       e.relationship_type,
                    'properties',         e.properties
                )
                ORDER BY e.relationship_type, src.entity_id
            )
            FROM graph_edges e
            JOIN graph_nodes src ON e.source_id = src.id
            JOIN graph_nodes tgt ON e.target_id = tgt.id
            WHERE (e.source_id = ANY(all_node_ids) AND e.target_id = ANY(all_node_ids))
        ),

        -- Tóm tắt thống kê để Gemini dễ đọc nhanh
        'summary', jsonb_build_object(
            'ticker',           UPPER(ticker_input),
            'total_nodes',      COALESCE(array_length(all_node_ids, 1), 0),
            'hop1_count',       COALESCE(array_length(hop1_node_ids, 1), 0),
            'query_timestamp',  NOW()::TEXT
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

-- Cấp quyền gọi RPC cho authenticated users và anon (tuỳ chỉnh theo nhu cầu bảo mật)
-- GRANT EXECUTE ON FUNCTION get_financial_network(TEXT) TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_financial_network(TEXT) TO anon;

-- ============================================================
-- DỮ LIỆU MẪU (SEED DATA) - Chạy sau khi tạo schema
-- Thêm các nodes vĩ mô cơ bản để test ngay
-- ============================================================
INSERT INTO graph_nodes (entity_id, entity_type, name, properties) VALUES
    -- Nhóm cổ phiếu Top 10
    ('HPG', 'STOCK', 'Tập đoàn Hòa Phát',         '{"sector":"steel","market_cap":"large","debt_usd":true}'),
    ('VHM', 'STOCK', 'Vinhomes',                    '{"sector":"real_estate","debt_vnd":true,"interest_rate_sensitive":true}'),
    ('VIC', 'STOCK', 'Tập đoàn Vingroup',           '{"sector":"conglomerate","interest_rate_sensitive":true}'),
    ('VCB', 'STOCK', 'Ngân hàng Vietcombank',       '{"sector":"banking","state_owned":true}'),
    ('TCB', 'STOCK', 'Ngân hàng Techcombank',       '{"sector":"banking","real_estate_exposure":true}'),
    ('BID', 'STOCK', 'Ngân hàng BIDV',              '{"sector":"banking","state_owned":true}'),
    ('MSN', 'STOCK', 'Tập đoàn Masan',              '{"sector":"consumer_retail","raw_material_dependent":true}'),
    ('VNM', 'STOCK', 'Công ty CP Sữa Việt Nam',     '{"sector":"consumer_staples","export_oriented":true}'),
    ('MWG', 'STOCK', 'Công ty CP Thế Giới Di Động', '{"sector":"retail","consumer_spending_sensitive":true}'),
    ('FPT', 'STOCK', 'Công ty CP FPT',              '{"sector":"technology","it_services":true,"export_revenue":true}'),

    -- Nhóm chỉ số vĩ mô quan trọng
    ('TY_GIA_USD_VND',  'MACRO', 'Tỷ giá USD/VND',         '{"unit":"VND per USD","current_approx":24500}'),
    ('LAI_SUAT_FED',    'MACRO', 'Lãi suất FED (Mỹ)',      '{"unit":"percent","impact":"global"}'),
    ('LAI_SUAT_VN',     'MACRO', 'Lãi suất cơ bản Việt Nam','{"unit":"percent","set_by":"SBV"}'),
    ('GIA_THEP_HRC',    'MACRO', 'Giá thép cuộn cán nóng (HRC)', '{"unit":"USD per ton","market":"global"}'),
    ('GIA_NHIET_LIEU',  'MACRO', 'Giá than cốc / nhiên liệu',  '{"unit":"USD per ton","market":"global"}'),
    ('CPI_VN',          'MACRO', 'Chỉ số giá tiêu dùng Việt Nam','{"unit":"percent YoY","scope":"Vietnam"}'),
    ('GDP_VN',          'MACRO', 'Tăng trưởng GDP Việt Nam', '{"unit":"percent","frequency":"quarterly"}'),
    ('GIA_SUA_NGUYEN_LIEU', 'MACRO', 'Giá sữa nguyên liệu quốc tế', '{"unit":"USD per ton","relevant_to":["VNM"]}'),

    -- Nhóm ngành
    ('SECTOR_STEEL',      'SECTOR', 'Ngành Thép Việt Nam',          '{}'),
    ('SECTOR_BANKING',    'SECTOR', 'Ngành Ngân hàng Việt Nam',     '{}'),
    ('SECTOR_REALESTATE', 'SECTOR', 'Ngành Bất động sản Việt Nam',  '{}'),
    ('SECTOR_TECH',       'SECTOR', 'Ngành Công nghệ Việt Nam',     '{}'),
    ('SECTOR_CONSUMER',   'SECTOR', 'Ngành Tiêu dùng / Bán lẻ VN', '{}')
ON CONFLICT (entity_id) DO UPDATE SET
    name       = EXCLUDED.name,
    properties = EXCLUDED.properties,
    updated_at = NOW();


-- ============================================================
-- CÁC CẠNh MẪU (SEED EDGES) - Logic tài chính thực tế
-- ============================================================
INSERT INTO graph_edges (source_id, target_id, relationship_type, properties)
SELECT src.id, tgt.id, rel_type, rel_props::JSONB
FROM (VALUES
    -- === TỶ GIÁ USD/VND ===
    -- HPG vay nợ USD lớn → tỷ giá tăng tác động tiêu cực
    ('TY_GIA_USD_VND', 'HPG', 'AFFECTS_NEGATIVE',
     '{"reason":"HPG có khoản vay USD lớn, tỷ giá tăng làm tăng chi phí trả nợ","weight":0.85}'),

    -- FPT có doanh thu xuất khẩu IT → tỷ giá tăng giúp tăng doanh thu VND
    ('TY_GIA_USD_VND', 'FPT', 'AFFECTS_POSITIVE',
     '{"reason":"FPT có ~50% doanh thu từ xuất khẩu IT, tỷ giá cao tăng lợi nhuận VND","weight":0.7}'),

    -- VNM nhập khẩu sữa nguyên liệu → tỷ giá tăng làm tăng chi phí
    ('TY_GIA_USD_VND', 'VNM', 'AFFECTS_NEGATIVE',
     '{"reason":"VNM nhập khẩu ~30% nguyên liệu, tỷ giá cao làm tăng giá thành","weight":0.6}'),

    -- === LÃI SUẤT VIỆT NAM ===
    -- Bất động sản rất nhạy cảm với lãi suất (VHM, VIC)
    ('LAI_SUAT_VN', 'VHM', 'AFFECTS_NEGATIVE',
     '{"reason":"Lãi suất cao làm giảm nhu cầu vay mua nhà, ảnh hưởng doanh thu VHM","weight":0.9}'),
    ('LAI_SUAT_VN', 'VIC', 'AFFECTS_NEGATIVE',
     '{"reason":"Vingroup có đòn bẩy tài chính cao, lãi suất tăng tăng chi phí vốn","weight":0.8}'),

    -- Ngân hàng: lãi suất cao → NIM tăng trong ngắn hạn (tích cực)
    ('LAI_SUAT_VN', 'VCB', 'AFFECTS_POSITIVE',
     '{"reason":"Lãi suất cao giúp VCB tăng NIM (biên lãi ròng) trong ngắn hạn","weight":0.5}'),
    ('LAI_SUAT_VN', 'TCB', 'AFFECTS_NEGATIVE',
     '{"reason":"TCB có exposure cao với BĐS, lãi suất cao làm tăng nợ xấu tiềm tàng","weight":0.75}'),

    -- === LÃI SUẤT FED ===
    -- Lãi suất FED tăng → vốn rút khỏi EM, VNĐ giảm → tác động toàn thị trường
    ('LAI_SUAT_FED', 'TY_GIA_USD_VND', 'AFFECTS_POSITIVE',
     '{"reason":"Fed tăng lãi suất → USD mạnh → tỷ giá USD/VND tăng","weight":0.8}'),
    ('LAI_SUAT_FED', 'LAI_SUAT_VN', 'AFFECTS_POSITIVE',
     '{"reason":"Fed tăng lãi suất → SBV phải tăng lãi suất theo để giữ tỷ giá","weight":0.7}'),

    -- === GIÁ THÉP / NGUYÊN LIỆU ===
    -- Giá HRC là đầu vào của HPG (trước khi HPG có HRC tự sản xuất)
    ('GIA_THEP_HRC', 'HPG', 'INPUT_COST_OF',
     '{"reason":"Giá thép HRC thế giới ảnh hưởng đến giá bán và biên lợi nhuận HPG","weight":0.85}'),

    -- Giá than cốc là nguyên liệu sản xuất thép
    ('GIA_NHIET_LIEU', 'HPG', 'INPUT_COST_OF',
     '{"reason":"Than cốc là nguyên liệu chính sản xuất thép trong lò cao","weight":0.8}'),

    -- === GIÁ SỮA NGUYÊN LIỆU ===
    ('GIA_SUA_NGUYEN_LIEU', 'VNM', 'INPUT_COST_OF',
     '{"reason":"VNM nhập khẩu sữa bột nguyên liệu làm đầu vào sản xuất","weight":0.75}'),

    -- === CPI - LẠM PHÁT ===
    -- Lạm phát cao → SBV tăng lãi suất
    ('CPI_VN', 'LAI_SUAT_VN', 'AFFECTS_POSITIVE',
     '{"reason":"CPI cao buộc SBV phải thắt chặt tiền tệ, tăng lãi suất điều hành","weight":0.85}'),

    -- Lạm phát ảnh hưởng đến sức mua → MWG (bán lẻ) chịu tác động
    ('CPI_VN', 'MWG', 'AFFECTS_NEGATIVE',
     '{"reason":"Lạm phát làm giảm sức mua, người tiêu dùng cắt giảm chi tiêu hàng điện tử","weight":0.65}'),

    -- === QUAN HỆ NGÀNH ===
    ('HPG', 'SECTOR_STEEL',      'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('VHM', 'SECTOR_REALESTATE', 'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('VIC', 'SECTOR_REALESTATE', 'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('VCB', 'SECTOR_BANKING',    'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('TCB', 'SECTOR_BANKING',    'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('BID', 'SECTOR_BANKING',    'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('MSN', 'SECTOR_CONSUMER',   'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('VNM', 'SECTOR_CONSUMER',   'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('MWG', 'SECTOR_CONSUMER',   'BELONGS_TO_SECTOR', '{"weight":1.0}'),
    ('FPT', 'SECTOR_TECH',       'BELONGS_TO_SECTOR', '{"weight":1.0}'),

    -- === QUAN HỆ NGÂN HÀNG → BẤT ĐỘNG SẢN ===
    -- TCB là ngân hàng có tỷ lệ cho vay BĐS cao nhất
    ('TCB', 'VHM', 'SUPPLIES_TO',
     '{"reason":"TCB là ngân hàng chủ lực tài trợ vốn cho dự án Vinhomes","weight":0.8}'),
    ('BID', 'VIC', 'SUPPLIES_TO',
     '{"reason":"BIDV cung cấp tín dụng cho các dự án lớn của Vingroup","weight":0.6}')

) AS edges(src_id, tgt_id, rel_type, rel_props)
JOIN graph_nodes src ON src.entity_id = edges.src_id
JOIN graph_nodes tgt ON tgt.entity_id = edges.tgt_id
ON CONFLICT DO NOTHING;


-- ============================================================
-- KIỂM TRA: Xác nhận schema và dữ liệu đã được tạo đúng
-- ============================================================
-- SELECT 'graph_nodes count' AS info, COUNT(*) FROM graph_nodes;
-- SELECT 'graph_edges count' AS info, COUNT(*) FROM graph_edges;
-- SELECT * FROM get_financial_network('HPG');
-- SELECT * FROM get_financial_network('VCB');
