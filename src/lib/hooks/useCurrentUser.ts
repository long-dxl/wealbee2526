import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase/client";

// Cache chung cho auth.getUser() trên toàn app — bất kỳ trang nào gọi hook này với
// cùng queryKey đều dùng chung 1 kết quả, không bắn nhiều request auth trùng lặp
// (trước đây Tổng quan tự gọi 2 lần, Danh mục 1 lần, mỗi lần một round-trip riêng).
export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
    staleTime: 5 * 60_000,
  });
}
