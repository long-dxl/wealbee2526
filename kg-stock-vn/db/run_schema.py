"""
run_schema.py
-------------
Script tự động chạy schema.sql lên Supabase.

Hỗ trợ 2 cách xác thực:
  Cách A: Database password (kết nối trực tiếp qua psycopg2)
  Cách B: Supabase Personal Access Token (Management API)

Cách A — thêm vào .env:
  DB_PASSWORD=your_database_password
  DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com   # lấy từ Dashboard → Settings → Database

Cách B — thêm vào .env:
  SUPABASE_PAT=your_personal_access_token  # từ supabase.com/dashboard/account/tokens

Chạy: python run_schema.py
"""

import os
import sys
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv('/Users/daoxuanlong/Projects/kg-stock-vn/.env')

PROJECT_REF  = "dyivojxybikidbxmgiwz"
SCHEMA_FILE  = Path(__file__).parent / "schema.sql"
DB_PASSWORD  = os.getenv("DB_PASSWORD")
DB_HOST      = os.getenv("DB_HOST", f"aws-0-ap-southeast-1.pooler.supabase.com")
SUPABASE_PAT = os.getenv("SUPABASE_PAT")
SERVICE_KEY  = os.getenv("SUPABASE_SERVICE_KEY")


def run_via_psycopg2():
    """Cách A: Kết nối trực tiếp PostgreSQL, chạy toàn bộ schema.sql."""
    import psycopg2

    # Supabase connection string mới (IPv4 pooler)
    connection_params = {
        "host":     DB_HOST,
        "port":     5432,
        "database": "postgres",
        "user":     f"postgres.{PROJECT_REF}",
        "password": DB_PASSWORD,
        "sslmode":  "require",
        "connect_timeout": 10,
    }

    print(f"🔌 Kết nối PostgreSQL: {connection_params['host']}...")
    sql_content = SCHEMA_FILE.read_text(encoding="utf-8")

    conn = psycopg2.connect(**connection_params)
    conn.autocommit = True
    cur = conn.cursor()

    print("⚙️  Đang chạy schema.sql...")
    cur.execute(sql_content)
    print("✅ schema.sql chạy thành công!")

    # Kiểm tra kết quả
    cur.execute("SELECT COUNT(*) FROM graph_nodes;")
    node_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM graph_edges;")
    edge_count = cur.fetchone()[0]

    print(f"📊 Kết quả: {node_count} nodes, {edge_count} edges")
    cur.close()
    conn.close()


def run_via_management_api():
    """Cách B: Dùng Supabase Personal Access Token để chạy SQL qua Management API."""
    sql_content = SCHEMA_FILE.read_text(encoding="utf-8")

    # Tách các statement DDL riêng lẻ để tránh timeout
    # (Management API xử lý từng batch nhỏ hơn)
    print("🌐 Gọi Supabase Management API...")
    resp = requests.post(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        headers={
            "Authorization": f"Bearer {SUPABASE_PAT}",
            "Content-Type": "application/json",
        },
        json={"query": sql_content},
        timeout=30,
    )

    if resp.status_code == 200:
        print("✅ schema.sql chạy thành công qua Management API!")
        print(f"   Response: {resp.json()}")
    else:
        print(f"❌ Lỗi {resp.status_code}: {resp.text[:300]}")
        sys.exit(1)


def main():
    print("=" * 60)
    print("🚀 KHỞI TẠO SUPABASE SCHEMA")
    print("=" * 60)

    if not SCHEMA_FILE.exists():
        print(f"❌ Không tìm thấy file: {SCHEMA_FILE}")
        sys.exit(1)

    if SUPABASE_PAT:
        print("→ Dùng Cách B: Personal Access Token")
        run_via_management_api()
    elif DB_PASSWORD:
        print("→ Dùng Cách A: Database Password (psycopg2)")
        run_via_psycopg2()
    else:
        print("❌ Chưa có DB_PASSWORD hoặc SUPABASE_PAT trong .env")
        print()
        print("Thêm vào file .env một trong hai:")
        print("  DB_PASSWORD=your_db_password")
        print("  (+ DB_HOST nếu region không phải ap-southeast-1)")
        print()
        print("  HOẶC:")
        print()
        print("  SUPABASE_PAT=your_personal_access_token")
        print("  Lấy tại: https://supabase.com/dashboard/account/tokens")
        sys.exit(1)


if __name__ == "__main__":
    main()
