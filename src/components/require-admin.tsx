import { Navigate, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";

type AdminState = "loading" | "ok" | "unauth" | "forbidden";

export function RequireAdmin() {
  const [state, setState] = useState<AdminState>("loading");
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setState("unauth"); return; }
      const role = (session.user.app_metadata as Record<string, unknown>)?.framework_role;
      setState(role === "expert" ? "ok" : "forbidden");
    });
  }, []);

  if (state === "loading") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0B0D18", color: "rgba(240,242,255,0.50)",
        fontFamily: "Montserrat, sans-serif", fontSize: 14,
      }}>
        Đang xác thực…
      </div>
    );
  }
  if (state === "unauth") return <Navigate to="/admin/login" replace state={{ from: location }} />;
  if (state === "forbidden") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "#0B0D18", color: "rgba(240,242,255,0.70)",
        fontFamily: "Montserrat, sans-serif", gap: 12,
      }}>
        <span style={{ fontSize: 32 }}>🔒</span>
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Không có quyền truy cập</p>
        <p style={{ fontSize: 13, color: "rgba(240,242,255,0.40)", margin: 0 }}>Tài khoản không có vai trò <code>framework_role = expert</code></p>
      </div>
    );
  }
  return <Outlet />;
}
