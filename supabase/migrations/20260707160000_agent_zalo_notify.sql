-- Cờ per-agent: bật/tắt gửi thông báo qua Zalo Bot cho từng agent (mặc định tắt).
-- run-agent chỉ đẩy Zalo khi agent.zalo_notify = true (giống email_notify).
alter table public.agents
  add column if not exists zalo_notify boolean not null default false;
