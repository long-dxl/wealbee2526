// Ngữ cảnh thị trường dùng chung cho run-agent + agent-scheduler (trước đây mỗi nơi
// một bản copy → drift). Nguồn sự thật duy nhất cho: chỉ số, giá VN30 + mã theo dõi,
// top tăng/giảm, tin tức 48h có đánh dấu danh mục.
//
// Lý do viết lại buildPriceContext: prices_daily nay có ~700 mã/phiên; query cũ
// `order(date desc).limit(75)` chỉ vớ được ~75 mã ngẫu nhiên của phiên cuối (không đủ
// 2 phiên cho bất kỳ mã nào) → "Giá VN30" sai, top movers rỗng, thiếu cả mã danh mục.

// deno-lint-ignore-file no-explicit-any

export interface RegistryLike {
  add(label: string, url: string): string;
}

export interface NewsSourceItem {
  type: string;
  title: string;
  url: string | null;
  date?: string;
  source?: string;
}

export const faUrl = (sym: string) => `https://fireant.vn/ma-chung-khoan/${sym}`;
const INDEX_URL: Record<string, string> = {
  VNINDEX: faUrl("VNINDEX"),
  HNX: faUrl("HNXINDEX"),
};

// Max age for price data: 5 calendar days (covers weekends + 1 holiday buffer)
export const PRICE_MAX_AGE_DAYS = 5;

export function daysSince(dateStr: string): number {
  const todayUtc = new Date().toISOString().substring(0, 10);
  return Math.round((new Date(todayUtc).getTime() - new Date(dateStr).getTime()) / 86400000);
}

// Dự phòng khi bảng tickers chưa gắn cờ in_vn30
const VN30_FALLBACK = [
  "ACB","BCM","BID","BVH","CTG","FPT","GAS","GVR","HDB","HPG","MBB","MSN","MWG","PLX","POW",
  "SAB","SHB","SSB","SSI","STB","TCB","TPB","VCB","VHM","VIB","VIC","VJC","VNM","VPB","VRE",
];

const fmtVN = (n: number, digits = 0) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function fmtVolume(v: number): string {
  if (v >= 1e6) return `${fmtVN(v / 1e6, 2)} triệu CP`;
  if (v >= 1e3) return `${fmtVN(v / 1e3, 0)} nghìn CP`;
  return `${fmtVN(v)} CP`;
}

/** Chỉ số + giá VN30 & mã theo dõi (2 phiên gần nhất → %Δ) + top tăng/giảm.
 *  targetSyms (danh mục/mã theo dõi) luôn được ưu tiên đưa lên đầu và gắn nhãn. */
export async function buildPriceContext(
  sb: any,
  registry?: RegistryLike,
  targetSyms: string[] = [],
): Promise<string> {
  const lines: string[] = [];
  const todayVN = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh",
  });
  lines.push(`Ngày phân tích: ${todayVN}`);
  lines.push(`(Bản tin/báo cáo phải đề đúng ngày phân tích này — không tự suy ra ngày khác)`);

  // ── Chỉ số thị trường ──────────────────────────────────────────────────────
  try {
    const { data: indices } = await sb
      .from("market_indices")
      .select("index_code, date, close, change_pt, change_pct")
      .in("index_code", ["VNINDEX", "HNX"])
      .order("date", { ascending: false })
      .limit(4);

    const seen = new Set<string>();
    const fresh: any[] = [];
    for (const idx of (indices ?? [])) {
      if (seen.has(idx.index_code)) continue;
      seen.add(idx.index_code);
      if (daysSince(idx.date) <= PRICE_MAX_AGE_DAYS) fresh.push(idx);
    }

    lines.push("\n## Chỉ số thị trường");
    if (fresh.length) {
      for (const idx of fresh) {
        const arrow = (idx.change_pct ?? 0) >= 0 ? "▲" : "▼";
        const pct = idx.change_pct != null ? `${idx.change_pct >= 0 ? "+" : ""}${Number(idx.change_pct).toFixed(2)}%` : "";
        const pt  = idx.change_pt  != null ? `${idx.change_pt  >= 0 ? "+" : ""}${Number(idx.change_pt).toFixed(2)} điểm` : "";
        const ref = registry ? ` ${registry.add(idx.index_code, INDEX_URL[idx.index_code] ?? INDEX_URL.VNINDEX)}` : "";
        lines.push(`- ${idx.index_code}: ${fmtVN(Number(idx.close), 2)} ${arrow} ${pt} (${pct}) · phiên ${idx.date}${ref}`);
      }
    } else {
      lines.push(`- Chưa có dữ liệu chỉ số trong DB (dữ liệu cuối: ${indices?.[0]?.date ?? "không rõ"}, đã quá ${PRICE_MAX_AGE_DAYS} ngày). Không được suy đoán giá trị chỉ số.`);
    }
  } catch { /* ignore */ }

  // ── Giá cổ phiếu: VN30 + mã theo dõi, đúng 2 phiên gần nhất mỗi mã ─────────
  try {
    let vn30: string[] = [];
    try {
      const { data } = await sb.from("tickers").select("symbol").eq("in_vn30", true);
      vn30 = (data ?? []).map((r: any) => String(r.symbol));
    } catch { /* dùng fallback */ }
    if (vn30.length < 20) vn30 = VN30_FALLBACK;

    const targets = targetSyms.map(s => s.toUpperCase()).filter(Boolean);
    const watch = [...new Set([...targets, ...vn30])];

    // 10 ngày lịch ≈ đủ 2 phiên giao dịch kể cả nghỉ lễ dài
    const cutoff = new Date(Date.now() - 10 * 86400000).toISOString().substring(0, 10);
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, date, close, volume")
      .in("symbol", watch)
      .gte("date", cutoff)
      .order("date", { ascending: false });

    interface Row { close: number; volume: number | null; date: string }
    const bySymbol: Record<string, Row[]> = {};
    for (const row of (prices ?? [])) {
      (bySymbol[row.symbol] ??= []);
      if (bySymbol[row.symbol].length < 2) {
        bySymbol[row.symbol].push({ close: Number(row.close), volume: row.volume != null ? Number(row.volume) : null, date: row.date });
      }
    }

    // Mã theo dõi: thêm thanh khoản 21 phiên (KL/TB20, phiên KL cao nhất) — dữ liệu
    // cốt lõi cho agent "KL đột biến" và làm giàu dòng danh mục của bản tin.
    const volNotes: Record<string, string[]> = {};
    if (targetSyms.length) {
      try {
        const { data: hist } = await sb
          .from("prices_daily")
          .select("symbol, date, close, volume")
          .in("symbol", targetSyms.map(s => s.toUpperCase()))
          .order("date", { ascending: false })
          .limit(21 * targetSyms.length + 10);
        const byS: Record<string, Array<{ date: string; close: number; volume: number }>> = {};
        for (const r of (hist ?? [])) {
          (byS[r.symbol] ??= []);
          if (byS[r.symbol].length < 21 && r.volume != null) {
            byS[r.symbol].push({ date: r.date, close: Number(r.close), volume: Number(r.volume) });
          }
        }
        for (const [s, rows] of Object.entries(byS)) {
          if (rows.length < 6) continue;
          const latest = rows[0];
          const prior = rows.slice(1);
          const avg20 = prior.reduce((a, r) => a + r.volume, 0) / prior.length;
          if (!avg20) continue;
          const notes = [`KL phiên ${latest.date}: ${fmtVolume(latest.volume)} = ${(latest.volume / avg20).toFixed(2)} lần TB${prior.length} phiên trước (TB ${fmtVolume(avg20)})`];
          let maxI = 0;
          for (let i = 1; i < rows.length; i++) if (rows[i].volume > rows[maxI].volume) maxI = i;
          const mx = rows[maxI];
          if (mx.date !== latest.date) {
            const others = rows.filter((_, i) => i !== maxI);
            const avgO = others.reduce((a, r) => a + r.volume, 0) / others.length;
            const prev = rows[maxI + 1];
            const pctD = prev ? ` · giá ${mx.close >= prev.close ? "+" : ""}${(((mx.close - prev.close) / prev.close) * 100).toFixed(2)}% phiên đó` : "";
            notes.push(`Phiên KL cao nhất ${rows.length} phiên: ${mx.date}, ${fmtVolume(mx.volume)} = ${(mx.volume / avgO).toFixed(2)} lần TB các phiên còn lại${pctD}`);
          }
          volNotes[s] = notes;
        }
      } catch { /* ignore */ }
    }

    const freshSymbols = watch.filter(s => bySymbol[s]?.length && daysSince(bySymbol[s][0].date) <= PRICE_MAX_AGE_DAYS);

    if (freshSymbols.length) {
      const pctOf = (s: string): number | null => {
        const rows = bySymbol[s];
        if (rows.length < 2 || !rows[1].close) return null;
        return ((rows[0].close - rows[1].close) / rows[1].close) * 100;
      };
      const lineOf = (s: string, tag: string): string => {
        const r = bySymbol[s][0];
        const pct = pctOf(s);
        const pctStr = pct != null ? ` ${pct >= 0 ? "▲ +" : "▼ "}${pct.toFixed(2)}%` : "";
        const vol = r.volume != null ? ` · KL ${fmtVolume(r.volume)}` : "";
        const ref = registry ? ` ${registry.add(s, faUrl(s))}` : "";
        return `- ${s}${tag}: ${fmtVN(r.close)} đ${pctStr}${vol} · phiên ${r.date}${ref}`;
      };

      const freshTargets = targets.filter(s => freshSymbols.includes(s));
      if (freshTargets.length) {
        lines.push("\n## Giá mã theo dõi / danh mục");
        for (const s of freshTargets) {
          lines.push(lineOf(s, " (danh mục)"));
          for (const n of (volNotes[s] ?? [])) lines.push(`  · ${n}`);
        }
      }

      lines.push("\n## Giá VN30");
      for (const s of freshSymbols.filter(s => !targets.includes(s))) lines.push(lineOf(s, ""));

      const movers = freshSymbols
        .map(s => ({ s, pct: pctOf(s) }))
        .filter((m): m is { s: string; pct: number } => m.pct != null)
        .sort((a, b) => b.pct - a.pct);
      const top5up   = movers.filter(m => m.pct > 0).slice(0, 5);
      const top5down = movers.filter(m => m.pct < 0).slice(-5).reverse();
      const moverRef = (s: string) => registry ? ` ${registry.add(s, faUrl(s))}` : "";
      if (top5up.length) {
        lines.push("\n### Top tăng (VN30 & mã theo dõi, so phiên liền trước)");
        for (const m of top5up) lines.push(`- ${m.s}: +${m.pct.toFixed(2)}%${moverRef(m.s)}`);
      }
      if (top5down.length) {
        lines.push("\n### Top giảm (VN30 & mã theo dõi, so phiên liền trước)");
        for (const m of top5down) lines.push(`- ${m.s}: ${m.pct.toFixed(2)}%${moverRef(m.s)}`);
      }
    } else {
      const lastDate = prices?.[0]?.date ?? "không rõ";
      lines.push("\n## Giá VN30");
      lines.push(`- Chưa có dữ liệu giá trong DB (dữ liệu cuối: ${lastDate}, đã quá ${PRICE_MAX_AGE_DAYS} ngày). Không được suy đoán giá cổ phiếu.`);
    }
  } catch { /* ignore */ }

  return lines.join("\n");
}

// Chuẩn hóa tiêu đề để khử tin trùng (cùng bài từ 2 nguồn, hoặc tiêu đề gắn "SYM: ").
function normTitle(title: string): string {
  return title
    .replace(/^[A-Z0-9]{3}:\s*/, "")
    .replace(/^NÓNG:\s*/i, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .substring(0, 120);
}

/** Tin 48h: mục riêng cho mã theo dõi/danh mục (gắn nhãn rõ) + top tin thị trường chung.
 *  LLM chỉ được coi là "tin ảnh hưởng danh mục" những tin nằm trong mục có nhãn. */
export async function buildNewsContext(
  sb: any,
  registry?: RegistryLike,
  targetSyms?: string[],
  filterSources?: string[],
  sources?: NewsSourceItem[],
): Promise<string> {
  try {
    const since = new Date(Date.now() - 48 * 3600000).toISOString();
    const baseQuery = () => {
      let q = sb
        .from("market_news")
        .select("title, content_summary, label, impact_score, affected_symbols, published_at, article_url, source")
        .or("label.is.null,label.neq.trash")
        .gte("published_at", since);
      if (filterSources && filterSources.length > 0) q = q.in("source", filterSources);
      return q;
    };

    const targets = (targetSyms ?? []).map(s => s.toUpperCase()).filter(Boolean);

    // Tin riêng theo từng mã theo dõi (5 tin/mã, ưu tiên tác động mạnh)
    const symNewsMap = new Map<string, any[]>();
    if (targets.length > 0) {
      await Promise.all(targets.map(async (sym) => {
        const { data } = await baseQuery()
          .contains("affected_symbols", [sym])
          .order("impact_score", { ascending: false, nullsFirst: false })
          .limit(5);
        if (data?.length) symNewsMap.set(sym, data);
      }));
    }

    // Top tin thị trường chung
    const { data: globalNews } = await baseQuery()
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(10);

    const seenUrl = new Set<string>();
    const seenTitle = new Set<string>();
    const isDup = (n: any): boolean => {
      const t = normTitle(n.title ?? "");
      if ((n.article_url && seenUrl.has(n.article_url)) || (t && seenTitle.has(t))) return true;
      if (n.article_url) seenUrl.add(n.article_url);
      if (t) seenTitle.add(t);
      return false;
    };

    const addItem = (n: any, lines: string[], portTag?: string) => {
      const syms  = n.affected_symbols?.length ? ` [${n.affected_symbols.slice(0, 4).join(",")}]` : "";
      const score = n.impact_score != null ? ` [tác động:${n.impact_score}]` : "";
      const date  = n.published_at ? ` (${String(n.published_at).substring(0, 10)})` : "";
      const ref = (registry && n.article_url) ? ` ${registry.add(n.source ?? "Báo", n.article_url)}` : "";
      lines.push(`- ${portTag ?? ""}${n.title}${syms}${score}${date}${ref}`);
      if (n.content_summary) lines.push(`  ${String(n.content_summary).substring(0, 150)}`);
      if (sources && (n.article_url || n.source)) {
        sources.push({
          type: "news", title: n.title, url: n.article_url ?? null,
          date: n.published_at ? String(n.published_at).substring(0, 10) : undefined,
          source: n.source ?? undefined,
        });
      }
    };

    const lines: string[] = [];

    if (targets.length > 0) {
      lines.push(`\n## Tin liên quan TRỰC TIẾP mã theo dõi/danh mục: ${targets.join(", ")} (48h)`);
      lines.push(`(CHỈ những tin trong mục này mới được tính là "tin ảnh hưởng danh mục")`);
      let any = false;
      for (const [sym, rows] of symNewsMap.entries()) {
        const kept = rows.filter(n => !isDup(n));
        if (!kept.length) continue;
        any = true;
        lines.push(`\n### ${sym}`);
        for (const n of kept) addItem(n, lines, `[DANH MỤC ${sym}] `);
      }
      if (!any) lines.push("(Không có tin trực tiếp về mã theo dõi trong 48h — phải ghi rõ điều này, không gán tin khác vào danh mục)");
    }

    const general = (globalNews ?? []).filter((n: any) => !isDup(n));
    if (general.length > 0) {
      lines.push("\n## Tin tức thị trường chung (48h)");
      for (const n of general.slice(0, 10)) addItem(n, lines);
    }

    return lines.length ? lines.join("\n") : "";
  } catch { return ""; }
}
