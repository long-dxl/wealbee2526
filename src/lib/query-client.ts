import { QueryClient } from "@tanstack/react-query";

// Cấu hình mặc định cho cả app: 30s "stale" trước khi coi là cũ (đủ ngắn để không
// hiện dữ liệu lỗi thời quá lâu, đủ dài để chuyển qua lại giữa các trang không
// phải tải lại từ đầu). Từng query có thể tự override staleTime nếu cần khác.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
