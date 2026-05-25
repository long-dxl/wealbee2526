import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[pipelineSupabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env"
  );
}

/**
 * pipelineSupabase — dùng cho market_news, stocks, subscribers và các bảng pipeline.
 * Dùng anon key (public). Service key chỉ dùng trong Edge Functions.
 */
export const pipelineSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
