#!/usr/bin/env bash
# setup_vm.sh — Provision 1 lần trên VM Ubuntu 22.04 (GCP e2-standard-4).
# Cài Python 3.11 + repo + venv + systemd (brain & scheduler) + Caddy (HTTPS) + cron pipelines.
#
# Dùng:
#   1) scp file này lên VM, hoặc dán nội dung vào ~/setup_vm.sh
#   2) Sửa REPO_URL + DOMAIN bên dưới
#   3) chmod +x setup_vm.sh && ./setup_vm.sh
#   4) Điền 2 file .env (script sẽ in đường dẫn), rồi:
#        sudo systemctl start wealbee-brain wealbee-scheduler
set -euo pipefail

# ════════════ SỬA CHO ĐÚNG ════════════
REPO_URL="https://github.com/QuangMinhPham/wealbee2526.git"   # private → xem README phần Deploy key
DOMAIN="api.your-domain.com"                                  # subdomain ĐÃ trỏ A record về IP tĩnh VM
WORKERS=5                                                     # uvicorn workers (e2-standard-4/16GB → 5 thoải mái)
# ═══════════════════════════════════════

APP=/opt/wealbee
VENV=$APP/.venv
PY=python3.11

echo "[1/9] Gói hệ thống + Python 3.11"
sudo apt-get update -y
sudo apt-get install -y software-properties-common curl git debian-keyring debian-archive-keyring apt-transport-https
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get update -y
sudo apt-get install -y $PY ${PY}-venv ${PY}-dev build-essential

echo "[2/9] User 'wealbee' + thư mục $APP"
sudo useradd -r -m -s /bin/bash wealbee 2>/dev/null || true
sudo mkdir -p "$APP" /var/log/wealbee
sudo chown -R wealbee:wealbee "$APP" /var/log/wealbee

echo "[3/9] Clone repo → $APP"
if [ -d "$APP/.git" ]; then
  sudo -u wealbee git -C "$APP" pull --ff-only
else
  sudo -u wealbee git clone "$REPO_URL" "$APP"
fi

echo "[4/9] venv + cài deps (kg-stock-vn + toolcrawldata + fastapi/uvicorn)"
sudo -u wealbee $PY -m venv "$VENV"
sudo -u wealbee "$VENV/bin/pip" install -U pip wheel
sudo -u wealbee "$VENV/bin/pip" install -r "$APP/kg-stock-vn/requirements.txt"
sudo -u wealbee "$VENV/bin/pip" install -r "$APP/toolcrawldata/requirements.txt"
sudo -u wealbee "$VENV/bin/pip" install "fastapi>=0.110" "uvicorn[standard]>=0.29"

echo "[5/9] File .env mẫu (NẾU chưa có)"
for d in kg-stock-vn toolcrawldata; do
  if [ ! -f "$APP/$d/.env" ]; then
    sudo -u wealbee cp "$APP/kg-stock-vn/deploy/env.example" "$APP/$d/.env"
    echo "    → tạo $APP/$d/.env (CẦN ĐIỀN khóa)"
  fi
done

echo "[6/9] systemd units (brain + scheduler)"
sudo cp "$APP/kg-stock-vn/deploy/systemd/wealbee-brain.service"     /etc/systemd/system/
sudo cp "$APP/kg-stock-vn/deploy/systemd/wealbee-scheduler.service" /etc/systemd/system/
# chèn số workers vào unit brain
sudo sed -i "s/__WORKERS__/$WORKERS/" /etc/systemd/system/wealbee-brain.service
sudo systemctl daemon-reload
sudo systemctl enable wealbee-brain wealbee-scheduler

echo "[7/9] Caddy (reverse proxy + auto HTTPS)"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y && sudo apt-get install -y caddy
fi
sudo sed "s/__DOMAIN__/$DOMAIN/" "$APP/kg-stock-vn/deploy/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl restart caddy

echo "[8/9] Cron pipelines (crawl/label/giá/báo cáo) cho user wealbee"
sudo sed "s#__VENV__#$VENV#g; s#__APP__#$APP#g" "$APP/kg-stock-vn/deploy/crontab.txt" | sudo -u wealbee crontab -

echo "[9/9] XONG provision."
echo
echo "════════════════════ CẦN LÀM TAY ════════════════════"
echo "1) Điền khóa vào:"
echo "     $APP/kg-stock-vn/.env"
echo "     $APP/toolcrawldata/.env"
echo "   (GEMINI_API_KEY, WEALBEE_SUPABASE_URL/KEY, SUPABASE_URL/SERVICE_KEY)"
echo "2) DNS: A record  $DOMAIN  →  IP tĩnh VM (đã làm chưa?)"
echo "3) Khởi động dịch vụ:"
echo "     sudo systemctl start wealbee-brain wealbee-scheduler"
echo "     sudo systemctl status wealbee-brain --no-pager"
echo "4) Test:  curl https://$DOMAIN/health"
echo "5) Vercel: đặt VITE_KG_API_URL=https://$DOMAIN rồi redeploy frontend."
echo "═══════════════════════════════════════════════════════"
