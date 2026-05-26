-- ============================================================
-- Phase 6: Seed agent templates + add missing columns
-- (agent_templates, agents, agent_runs, briefs đã có từ platform_tables)
-- ============================================================

-- Thêm cột còn thiếu vào agent_templates
ALTER TABLE public.agent_templates ADD COLUMN IF NOT EXISTS category   text DEFAULT 'market';
ALTER TABLE public.agent_templates ADD COLUMN IF NOT EXISTS sort_order int  DEFAULT 0;

-- RLS cho agent_templates (nếu chưa enable)
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='agent_templates' AND policyname='Public read agent_templates'
  ) THEN
    EXECUTE 'CREATE POLICY "Public read agent_templates" ON public.agent_templates FOR SELECT USING (true)';
  END IF;
END $$;

-- RLS cho agents
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='agents' AND policyname='Users manage own agents'
  ) THEN
    EXECUTE 'CREATE POLICY "Users manage own agents" ON public.agents FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- RLS cho agent_runs
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='agent_runs' AND policyname='Users read own runs'
  ) THEN
    EXECUTE 'CREATE POLICY "Users read own runs" ON public.agent_runs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- RLS cho briefs
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='briefs' AND policyname='Users manage own briefs'
  ) THEN
    EXECUTE 'CREATE POLICY "Users manage own briefs" ON public.briefs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- ─── Seed agent templates ─────────────────────────────────────────────────────
-- agent_templates.id = template_id (TEXT PK), system_prompt = prompt

INSERT INTO public.agent_templates (id, name, description, category, icon, color, sort_order, system_prompt) VALUES

('daily_digest',
 'Bản tin buổi sáng',
 'Tổng hợp thị trường VN30, tin tức nổi bật và điểm cần chú ý trong ngày',
 'market', 'mail', '#0849ac', 1,
 'Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam. Hãy tạo bản tin thị trường buổi sáng ngắn gọn, chuyên nghiệp dựa trên dữ liệu thực bên dưới.

Bản tin phải bao gồm:
1. **Tổng quan thị trường**: VN-Index, HNX hôm nay (điểm số, thay đổi, xu hướng)
2. **Top 3 cổ phiếu tăng mạnh nhất** trong VN30
3. **Top 3 cổ phiếu giảm mạnh nhất** trong VN30
4. **Tin tức nổi bật** có tác động cao nhất (2-3 tin)
5. **Điểm cần chú ý** (1-2 câu kết luận ngắn)

Viết bằng tiếng Việt, tone chuyên nghiệp. Dùng emoji phù hợp. KHÔNG khuyến nghị mua/bán.'),

('portfolio_health',
 'Theo dõi danh mục',
 'Phân tích sức khỏe danh mục, P&L hôm nay và cảnh báo biến động',
 'portfolio', 'bar-chart', '#0ea5a0', 2,
 'Bạn là chuyên gia phân tích danh mục đầu tư. Hãy phân tích sức khỏe danh mục dựa trên dữ liệu thực.

Phân tích bao gồm:
1. **Tổng quan danh mục**: Giá trị hiện tại, P&L hôm nay
2. **Cổ phiếu nổi bật**: Tăng/giảm mạnh nhất trong danh mục
3. **Cảnh báo**: Biến động >2% so với hôm qua
4. **So sánh benchmark**: Danh mục vs VN-Index
5. **Theo dõi tiếp** (thông tin tham khảo, không phải khuyến nghị)

Viết ngắn gọn, tập trung vào số liệu. KHÔNG khuyến nghị mua/bán cụ thể.'),

('market_scanner',
 'Quét cơ hội thị trường',
 'Tìm cổ phiếu VN30 có biến động bất thường, tin tức và tín hiệu đáng chú ý',
 'market', 'search', '#8b5cf6', 3,
 'Bạn là chuyên gia phân tích thị trường. Hãy quét toàn bộ VN30 và phát hiện những điểm đáng chú ý hôm nay.

Quét tìm:
1. **Biến động bất thường**: Cổ phiếu tăng/giảm >2% ngày hôm nay
2. **Tin tức có tác động cao**: Liên quan đến VN30 trong 48h
3. **Xu hướng ngắn hạn**: Cổ phiếu đang tăng/giảm liên tiếp 3+ phiên
4. **Nhóm ngành nổi bật**: Ngành nào đang dẫn dắt thị trường

Trình bày dạng danh sách ngắn gọn. KHÔNG khuyến nghị mua/bán.'),

('earnings_watch',
 'Theo dõi KQKD',
 'Tổng hợp kết quả kinh doanh, dự báo và tác động đến cổ phiếu',
 'fundamental', 'trending-up', '#f59e0b', 4,
 'Bạn là chuyên gia phân tích tài chính. Hãy tổng hợp thông tin kết quả kinh doanh gần nhất.

Tổng hợp:
1. **Công bố KQKD mới**: Từ tin tức trong 48h
2. **Điểm nổi bật**: Doanh thu, lợi nhuận, so sánh kỳ trước
3. **Tác động cổ phiếu**: Giá thay đổi sau công bố
4. **Tác động ngành**: Ảnh hưởng lan rộng ra sao

KHÔNG đưa ra khuyến nghị đầu tư.'),

('macro_watch',
 'Theo dõi vĩ mô',
 'Tổng hợp tin kinh tế vĩ mô trong nước và quốc tế ảnh hưởng đến TTCK',
 'macro', 'globe', '#10b981', 5,
 'Bạn là chuyên gia kinh tế vĩ mô. Hãy tổng hợp yếu tố vĩ mô tác động đến thị trường chứng khoán Việt Nam.

Tổng hợp:
1. **Kinh tế trong nước**: Lạm phát, tỷ giá USD/VND, lãi suất, FDI
2. **Diễn biến quốc tế**: Fed, thị trường Mỹ/Trung, giá dầu, USD Index
3. **Tác động dự kiến**: Phân tích ngắn về ảnh hưởng đến VN-Index
4. **Rủi ro cần theo dõi** trong 1-2 tuần tới

KHÔNG đưa ra khuyến nghị đầu tư.')

ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  category    = EXCLUDED.category,
  icon        = EXCLUDED.icon,
  color       = EXCLUDED.color,
  sort_order  = EXCLUDED.sort_order;

-- ─── Seed demo user agents (sẽ gán cho user thực khi họ đăng nhập) ──────────
-- Không seed vì cần user_id thực. Frontend sẽ tự tạo khi user kích hoạt.
