/**
 * RequireAuth — chặn truy cập /app khi chưa đăng nhập.
 * Chưa đăng nhập → chuyển về /login (giữ lại đường dẫn muốn vào).
 */
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../lib/auth-context";

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#667085", fontFamily: "Montserrat, sans-serif" }}>
        Đang tải…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
