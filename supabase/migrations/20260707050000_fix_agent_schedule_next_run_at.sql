-- Fix lỗi nghiêm trọng: agents.next_run_at KHÔNG BAO GIỜ được khởi tạo khi tạo/sửa
-- agent chạy theo lịch — agent-scheduler chỉ ĐỌC next_run_at (WHERE next_run_at <= now())
-- và tự CẬP NHẬT nó SAU khi đã chạy 1 agent, nhưng không ai từng gán giá trị đầu tiên.
-- Hệ quả: kiểm tra thực tế cho thấy CẢ 5 agent "scheduled" đang active trong hệ thống
-- đều có next_run_at = NULL — nghĩa là KHÔNG agent nào từng tự chạy theo lịch từ trước
-- đến nay, bất kể "Mỗi ngày"/"Ngày GD"/"Hàng tuần"/"Tùy chọn" gì.
--
-- Fix bằng trigger (thay vì sửa từng nơi tạo/sửa agent ở frontend) để không thể quên:
-- mọi INSERT/UPDATE làm đổi schedule/status/trigger_type đều tự tính lại next_run_at.
-- Logic PORT Y HỆT parseSchedule()/calcNextRunAt()/uiDayToJS() trong
-- supabase/functions/agent-scheduler/index.ts — sửa 1 bên nhớ soi lại bên kia.

CREATE OR REPLACE FUNCTION compute_agent_next_run_at(
  p_schedule     text,
  p_status       text,
  p_trigger_type text
) RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  v_json       jsonb;
  v_mode       text;
  v_frequency  text;
  v_time       text;
  v_days       int[] := '{}';
  v_hour       int;
  v_minute     int;
  v_valid_days int[];
  v_today_vn   date;
  v_cand_date  date;
  v_cand_dow   int;
  v_cand_utc   timestamptz;
  v_match      text[];
  i            int;
BEGIN
  IF p_status IS DISTINCT FROM 'active' OR p_trigger_type IS DISTINCT FROM 'scheduled' THEN
    RETURN NULL;
  END IF;
  IF p_schedule IS NULL OR p_schedule IN ('', 'manual', 'realtime') THEN
    RETURN NULL;
  END IF;

  -- Định dạng JSON: {"mode":"scheduled","frequency":"daily|weekdays|weekly|custom","time":"HH:MM","days":[...]}
  v_mode := NULL;
  BEGIN
    v_json := p_schedule::jsonb;
    IF (v_json->>'mode') IS NOT NULL AND (v_json->>'frequency') IS NOT NULL AND (v_json->>'time') IS NOT NULL THEN
      v_mode      := v_json->>'mode';
      v_frequency := v_json->>'frequency';
      v_time      := v_json->>'time';
      SELECT COALESCE(array_agg(x::int), '{}')
        INTO v_days
        FROM jsonb_array_elements_text(COALESCE(v_json->'days', '[]'::jsonb)) x;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_mode := NULL;  -- không phải JSON hợp lệ → rơi xuống định dạng rút gọn cũ
  END;

  -- Định dạng rút gọn cũ: "daily:HH:MM" | "weekdays:HH:MM" | "weekly:HH:MM"
  IF v_mode IS NULL THEN
    v_match := regexp_match(p_schedule, '^(daily|weekdays|weekly):([0-9]{1,2}:[0-9]{2})$');
    IF v_match IS NULL THEN
      RETURN NULL;
    END IF;
    v_mode      := 'scheduled';
    v_frequency := v_match[1];
    v_time      := v_match[2];
    v_days      := '{}';
  END IF;

  IF v_mode IS DISTINCT FROM 'scheduled' THEN
    RETURN NULL;
  END IF;

  v_hour   := split_part(v_time, ':', 1)::int;
  v_minute := split_part(v_time, ':', 2)::int;

  IF v_frequency = 'daily' THEN
    v_valid_days := ARRAY[0,1,2,3,4,5,6];
  ELSIF v_frequency = 'weekdays' THEN
    v_valid_days := ARRAY[1,2,3,4,5];
  ELSE
    -- weekly/custom: map ngày UI (0=T2..5=T7,6=CN) sang JS day-of-week (0=CN..6=T7)
    SELECT COALESCE(array_agg(CASE WHEN d = 6 THEN 0 ELSE d + 1 END), '{}')
      INTO v_valid_days FROM unnest(v_days) AS d;
  END IF;

  IF v_valid_days IS NULL OR array_length(v_valid_days, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  v_today_vn := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  -- Bootstrap: cho phép chạy NGAY HÔM NAY nếu giờ chưa qua (tương đương
  -- startFromToday=true bên TS — hợp lý khi user vừa tạo/sửa lịch).
  FOR i IN 0..8 LOOP
    v_cand_date := v_today_vn + i;
    v_cand_dow  := extract(dow FROM v_cand_date)::int;
    v_cand_utc  := (v_cand_date + make_time(v_hour, v_minute, 0)) AT TIME ZONE 'Asia/Ho_Chi_Minh';
    IF v_cand_dow = ANY(v_valid_days) AND v_cand_utc > now() THEN
      RETURN v_cand_utc;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION agents_set_next_run_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.next_run_at := compute_agent_next_run_at(NEW.schedule, NEW.status, NEW.trigger_type);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agents_next_run_at_trg ON agents;
CREATE TRIGGER agents_next_run_at_trg
  BEFORE INSERT OR UPDATE OF schedule, status, trigger_type ON agents
  FOR EACH ROW
  EXECUTE FUNCTION agents_set_next_run_at();

-- Backfill: các agent scheduled đang active hiện tại đều đang next_run_at = NULL
-- (chưa từng được khởi tạo) → tính ngay để agent-scheduler bắt đầu nhặt được.
UPDATE agents
SET next_run_at = compute_agent_next_run_at(schedule, status, trigger_type)
WHERE trigger_type = 'scheduled' AND status = 'active' AND next_run_at IS NULL;
