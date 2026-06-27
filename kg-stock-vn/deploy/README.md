# Deploy Wealbee brain lên GCP (e2-standard-4, Singapore, Caddy HTTPS)

Bộ script triển khai **bộ não `kg-stock-vn` (FastAPI)** + **scheduler agent** + **cron pipelines**
lên 1 VM Google Compute Engine. Frontend (Vercel) và Edge Functions (Supabase) **giữ nguyên**, chỉ
trỏ `VITE_KG_API_URL` về domain của VM.

```
Vercel (https) ──VITE_KG_API_URL──► https://api.your-domain ─[Caddy :443]─► uvicorn :8077 (5 workers)
                                                                            scheduler_local.py (systemd)
                                                                            cron → toolcrawldata/*.py
```

## 0) Yêu cầu
- Đã cài `gcloud` CLI + đăng nhập (`gcloud auth login`, `gcloud config set project <PROJECT_ID>`).
- 1 (sub)domain bạn quản lý DNS (vd `api.your-domain.com`).
- Khóa: `GEMINI_API_KEY`, Supabase URL + **service role key** (lấy từ `.env` local hiện có).

## 1) Tạo IP tĩnh + VM + firewall (chạy ở máy bạn)
```bash
REGION=asia-southeast1; ZONE=asia-southeast1-b

# IP tĩnh
gcloud compute addresses create wealbee-ip --region=$REGION
IP=$(gcloud compute addresses describe wealbee-ip --region=$REGION --format='value(address)')
echo "IP tĩnh: $IP   → trỏ A record api.your-domain.com về IP này"

# VM e2-standard-4 (4 vCPU / 16GB), Ubuntu 22.04
gcloud compute instances create wealbee \
  --zone=$ZONE --machine-type=e2-standard-4 \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-balanced \
  --address=$IP --tags=http-server,https-server

# Mở 80/443 (Caddy cần 80 cho ACME + 443 phục vụ)
gcloud compute firewall-rules create allow-http  --allow=tcp:80  --target-tags=http-server  2>/dev/null || true
gcloud compute firewall-rules create allow-https --allow=tcp:443 --target-tags=https-server 2>/dev/null || true
```

## 2) Trỏ DNS
Tạo bản ghi **A**: `api.your-domain.com → <IP tĩnh ở trên>`. Đợi vài phút cho propagate
(Caddy sẽ tự xin SSL khi domain đã trỏ đúng).

## 3) Repo private — chọn 1 cách lấy code
- **Deploy key (khuyên dùng, read-only):** trên VM `ssh-keygen -t ed25519 -C wealbee` → thêm public key vào
  GitHub repo *Settings → Deploy keys*, rồi đặt `REPO_URL=git@github.com:QuangMinhPham/wealbee2526.git`.
- **Hoặc PAT:** `REPO_URL=https://<TOKEN>@github.com/QuangMinhPham/wealbee2526.git`.

## 4) Chạy provisioning trên VM
```bash
gcloud compute ssh wealbee --zone=asia-southeast1-b

# trên VM:
curl -O https://raw.githubusercontent.com/.../setup_vm.sh   # hoặc scp / dán nội dung
nano setup_vm.sh        # sửa REPO_URL + DOMAIN (+ WORKERS nếu muốn)
chmod +x setup_vm.sh && ./setup_vm.sh
```
> `setup_vm.sh` nằm sẵn trong repo tại `kg-stock-vn/deploy/setup_vm.sh`. Cách gọn nhất: `git clone`
> thủ công 1 lần rồi chạy `bash /opt/wealbee/kg-stock-vn/deploy/setup_vm.sh` — script sẽ idempotent
> (pull lại, cài lại deps, cập nhật unit/Caddy).

Script tự: cài Python 3.11 + venv + deps, dựng systemd `wealbee-brain` & `wealbee-scheduler`,
cài Caddy (HTTPS), nạp cron pipelines, tạo `.env` mẫu.

## 5) Điền .env rồi khởi động
```bash
sudo -u wealbee nano /opt/wealbee/kg-stock-vn/.env       # GEMINI + Supabase
sudo -u wealbee nano /opt/wealbee/toolcrawldata/.env     # thường trùng

sudo systemctl start wealbee-brain wealbee-scheduler
sudo systemctl status wealbee-brain --no-pager
curl https://api.your-domain.com/health                  # {"ok":true,...}
```

## 6) Nối frontend
Vercel → Project Settings → Environment Variables: `VITE_KG_API_URL=https://api.your-domain.com`
→ **Redeploy**. Từ đó "Chạy thử" / "Run now" / ActionHub gọi brain trên VM.

---

## Vận hành nhanh
```bash
# log brain / scheduler
journalctl -u wealbee-brain -f
journalctl -u wealbee-scheduler -f
# log pipeline
tail -f /var/log/wealbee/crawl.log /var/log/wealbee/label.log

# cập nhật code mới
sudo -u wealbee git -C /opt/wealbee pull
sudo systemctl restart wealbee-brain wealbee-scheduler

# đổi số workers: sửa /etc/systemd/system/wealbee-brain.service rồi daemon-reload + restart
```

## Lịch tự động (giờ VN)
| Job | Giờ | Việc |
|---|---|---|
| crawl tin | 06:00 | `pipeline_runner.py` |
| gán nhãn | 06:25 | `run_label_only.py` |
| báo cáo Vietstock | 07:05 | `sync_vietstock_reports.py` |
| cập nhật giá | 15:30 (T2–T6) | `seed_prices_dnse.py` |
| agent tóm tắt sáng | đặt `daily:07:00` trong agent | scheduler systemd kích hoạt |

## Hai trần thật cần theo dõi (quan trọng hơn cỡ VM)
1. **Quota Gemini** — nhiều user đồng thời dễ 429. Bật billing cho key / xoay nhiều key.
2. **Sau 3 tháng hết credit** — e2-standard-4 ~$98/mo. Khi đó cân nhắc hạ về e2-standard-2,
   hoặc tách brain sang dịch vụ managed.

## Bảo mật
- `.env` **không** nằm trong git (đã `.gitignore`). Service role key chỉ ở trên VM.
- uvicorn bind `127.0.0.1` (không lộ 8077 ra ngoài); chỉ Caddy 80/443 public.
- Cân nhắc `gcloud compute firewall-rules` giới hạn SSH theo IP của bạn.
