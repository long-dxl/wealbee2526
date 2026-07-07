// Chuỗi giá trị / yếu tố đầu vào–đầu ra theo ngành (đồ thị nhân-quả).
// Curate từ kg-stock-vn (seed_sector_graph + seed_value_chain). Dùng cho tool get_value_chain
// ở bee-ai-chat (ActionHub) + run-agent (Agent Studio) để Agent phân tích yếu tố tác động.

interface Commodity { name: string; unit: string; source: string }
const COMMODITY: Record<string, Commodity> = {
  GIA_QUANG_SAT:  { name: "Quặng sắt 62% Fe", unit: "USD/tấn", source: "Trading Economics (CFR China)" },
  GIA_THAN_COC:   { name: "Than cốc (luyện thép)", unit: "USD/tấn", source: "Trading Economics (FOB Australia)" },
  GIA_THEP_HRC:   { name: "Thép cuộn cán nóng HRC", unit: "USD/tấn", source: "CME (HRC=F)" },
  GIA_THEP_XD:    { name: "Thép xây dựng (thanh/cuộn)", unit: "VND/kg", source: "Hiệp hội Thép VN (VSA)" },
  GIA_DAU_BRENT:  { name: "Dầu Brent", unit: "USD/thùng", source: "ICE (BZ=F)" },
  GIA_KHI_GAS:    { name: "Khí tự nhiên", unit: "USD/MMBtu", source: "NYMEX (NG=F)" },
  GIA_NHIEN_BAY:  { name: "Nhiên liệu bay (Jet A1, proxy HO)", unit: "USD/gallon", source: "NYMEX Heating Oil (HO=F)" },
  GIA_CUOC_BIEN:  { name: "Giá cước vận tải biển (container/khô)", unit: "chỉ số", source: "Drewry WCI / Baltic Dry Index" },
  GIA_URE:        { name: "Phân urea", unit: "USD/tấn", source: "Trading Economics" },
  GIA_SUA:        { name: "Sữa bột nguyên liệu", unit: "USD/tấn", source: "GlobalDairyTrade" },
  GIA_DUONG:      { name: "Đường thô", unit: "US cent/lb", source: "ICE Sugar #11 (SB=F)" },
  GIA_KHO_DAU:    { name: "Khô đậu tương (TĂCN)", unit: "USD/tấn", source: "CBOT (ZM=F)" },
  GIA_NGO:        { name: "Ngô (TĂCN)", unit: "US cent/giạ", source: "CBOT (ZC=F)" },
  GIA_HEO_HOI:    { name: "Heo hơi", unit: "đồng/kg", source: "Giá heo VN + CME Lean Hogs" },
  GIA_BONG:       { name: "Bông", unit: "US cent/lb", source: "ICE Cotton (CT=F)" },
  GIA_CAO_SU:     { name: "Cao su tự nhiên", unit: "USD/kg", source: "SICOM/TOCOM" },
  GIA_NHUA_HAT:   { name: "Hạt nhựa (PVC/PE, theo dầu)", unit: "USD/tấn", source: "Platts (theo Brent)" },
};

interface MacroDriver { factor: string; sign: "+" | "-"; mechanism: string }
interface Chain { label: string; inputs: string[]; outputs: string[]; macro?: MacroDriver[] }

const SECTOR_CHAIN: Record<string, Chain> = {
  SECTOR_STEEL: { label: "Thép", inputs: ["GIA_QUANG_SAT", "GIA_THAN_COC"], outputs: ["GIA_THEP_HRC", "GIA_THEP_XD"],
    macro: [{ factor: "Đầu tư công / xây dựng", sign: "+", mechanism: "Giải ngân hạ tầng kéo cầu thép" }] },
  SECTOR_CONSTRUCTION: { label: "Xây dựng", inputs: ["GIA_THEP_XD", "GIA_THEP_HRC"], outputs: [],
    macro: [{ factor: "Đầu tư công", sign: "+", mechanism: "Khối lượng thi công tăng" }, { factor: "Lãi suất", sign: "-", mechanism: "Chi phí vốn & cầu BĐS" }] },
  SECTOR_REALESTATE: { label: "Bất động sản", inputs: ["GIA_THEP_XD"], outputs: [],
    macro: [{ factor: "Lãi suất", sign: "-", mechanism: "Cầu mua nhà nhạy lãi suất" }, { factor: "Tín dụng BĐS", sign: "+", mechanism: "Room tín dụng nới → thanh khoản" }] },
  SECTOR_OIL_GAS: { label: "Dầu khí", inputs: [], outputs: ["GIA_DAU_BRENT", "GIA_KHI_GAS"],
    macro: [{ factor: "Giá dầu thế giới", sign: "+", mechanism: "Thượng nguồn hưởng lợi khi giá dầu tăng" }] },
  SECTOR_AVIATION: { label: "Hàng không", inputs: ["GIA_NHIEN_BAY", "GIA_DAU_BRENT"], outputs: [],
    macro: [{ factor: "Tỷ giá USD/VND", sign: "-", mechanism: "Chi phí thuê tàu bay & nhiên liệu bằng USD" }, { factor: "Du lịch/đi lại", sign: "+", mechanism: "Sản lượng khách" }] },
  SECTOR_LOGISTICS: { label: "Vận tải - Cảng biển - Logistics", inputs: ["GIA_DAU_BRENT", "GIA_NHIEN_BAY"], outputs: ["GIA_CUOC_BIEN"],
    macro: [{ factor: "Giá cước vận tải biển", sign: "+", mechanism: "Cước tăng → doanh thu hãng tàu/cảng tăng" }, { factor: "Sản lượng XNK / thương mại", sign: "+", mechanism: "Khối lượng hàng qua cảng" }] },
  SECTOR_UTILITIES: { label: "Điện - Tiện ích", inputs: ["GIA_THAN_COC", "GIA_KHI_GAS"], outputs: [],
    macro: [{ factor: "Phụ tải điện / thời tiết (El Niño-La Niña)", sign: "+", mechanism: "Thủy điện vs nhiệt điện theo thủy văn" }] },
  SECTOR_FERTILIZER: { label: "Phân bón - Hóa chất", inputs: ["GIA_KHI_GAS"], outputs: ["GIA_URE"],
    macro: [{ factor: "Giá nông sản / mùa vụ", sign: "+", mechanism: "Cầu phân bón theo sản xuất nông nghiệp" }] },
  SECTOR_CONSUMER: { label: "Tiêu dùng - Thực phẩm", inputs: ["GIA_SUA", "GIA_DUONG"], outputs: [],
    macro: [{ factor: "Sức mua / CPI", sign: "+", mechanism: "Thu nhập & tiêu dùng nội địa" }] },
  SECTOR_LIVESTOCK: { label: "Nông nghiệp - Chăn nuôi", inputs: ["GIA_KHO_DAU", "GIA_NGO"], outputs: ["GIA_HEO_HOI"],
    macro: [{ factor: "Dịch bệnh đàn (ASF)", sign: "-", mechanism: "Rủi ro nguồn cung & giá heo" }] },
  SECTOR_SEAFOOD: { label: "Thủy sản", inputs: ["GIA_KHO_DAU"], outputs: [],
    macro: [{ factor: "Thuế quan / nhu cầu Mỹ-EU", sign: "+", mechanism: "Xuất khẩu là đầu ra chính" }, { factor: "Tỷ giá USD/VND", sign: "+", mechanism: "Doanh thu USD quy đổi" }] },
  SECTOR_TEXTILE: { label: "Dệt may", inputs: ["GIA_BONG"], outputs: [],
    macro: [{ factor: "Thuế quan Mỹ", sign: "-", mechanism: "Đầu ra xuất khẩu chịu thuế" }, { factor: "Tỷ giá USD/VND", sign: "+", mechanism: "Doanh thu xuất khẩu quy đổi VND" }] },
  SECTOR_TIRE: { label: "Săm lốp - Cao su CN", inputs: ["GIA_CAO_SU", "GIA_DAU_BRENT"], outputs: [],
    macro: [{ factor: "Sản lượng ô tô / vận tải", sign: "+", mechanism: "Cầu lốp thay thế & OEM" }] },
  SECTOR_INDUSTRIAL: { label: "KCN - Cao su tự nhiên", inputs: [], outputs: ["GIA_CAO_SU"],
    macro: [{ factor: "FDI / vốn đầu tư", sign: "+", mechanism: "Cầu thuê đất KCN" }] },
  SECTOR_PLASTIC: { label: "Nhựa", inputs: ["GIA_NHUA_HAT", "GIA_DAU_BRENT"], outputs: [],
    macro: [{ factor: "Đầu tư công / xây dựng", sign: "+", mechanism: "Cầu ống nhựa hạ tầng" }] },
};

// Map cổ phiếu → ngành (curate từ kg-stock-vn, mở rộng các mã phổ biến cùng ngành)
const TICKER_SECTOR: Record<string, string> = {
  // Thép
  HPG: "SECTOR_STEEL", HSG: "SECTOR_STEEL", NKG: "SECTOR_STEEL", SMC: "SECTOR_STEEL", TLH: "SECTOR_STEEL", POM: "SECTOR_STEEL",
  // Xây dựng
  CTD: "SECTOR_CONSTRUCTION", HBC: "SECTOR_CONSTRUCTION", VCG: "SECTOR_CONSTRUCTION", HHV: "SECTOR_CONSTRUCTION", C4G: "SECTOR_CONSTRUCTION",
  // BĐS
  VHM: "SECTOR_REALESTATE", VIC: "SECTOR_REALESTATE", VRE: "SECTOR_REALESTATE", NLG: "SECTOR_REALESTATE", KDH: "SECTOR_REALESTATE", DXG: "SECTOR_REALESTATE", PDR: "SECTOR_REALESTATE", DIG: "SECTOR_REALESTATE", NVL: "SECTOR_REALESTATE",
  // Dầu khí
  GAS: "SECTOR_OIL_GAS", PLX: "SECTOR_OIL_GAS", BSR: "SECTOR_OIL_GAS", PVD: "SECTOR_OIL_GAS", PVS: "SECTOR_OIL_GAS", PVT: "SECTOR_LOGISTICS",
  // Hàng không
  HVN: "SECTOR_AVIATION", VJC: "SECTOR_AVIATION",
  // Logistics - Cảng biển
  GMD: "SECTOR_LOGISTICS", HAH: "SECTOR_LOGISTICS", VSC: "SECTOR_LOGISTICS", VOS: "SECTOR_LOGISTICS", PHP: "SECTOR_LOGISTICS", SGP: "SECTOR_LOGISTICS",
  // Điện - tiện ích
  POW: "SECTOR_UTILITIES", NT2: "SECTOR_UTILITIES", PPC: "SECTOR_UTILITIES", REE: "SECTOR_UTILITIES", GEG: "SECTOR_UTILITIES", HDG: "SECTOR_UTILITIES",
  // Phân bón - hóa chất
  DPM: "SECTOR_FERTILIZER", DCM: "SECTOR_FERTILIZER", DGC: "SECTOR_FERTILIZER", BFC: "SECTOR_FERTILIZER", CSV: "SECTOR_FERTILIZER",
  // Tiêu dùng - thực phẩm
  VNM: "SECTOR_CONSUMER", SAB: "SECTOR_CONSUMER", MSN: "SECTOR_CONSUMER", QNS: "SECTOR_CONSUMER", SBT: "SECTOR_CONSUMER", KDC: "SECTOR_CONSUMER",
  // Chăn nuôi
  DBC: "SECTOR_LIVESTOCK", BAF: "SECTOR_LIVESTOCK", HAG: "SECTOR_LIVESTOCK",
  // Thủy sản
  VHC: "SECTOR_SEAFOOD", ANV: "SECTOR_SEAFOOD", FMC: "SECTOR_SEAFOOD", IDI: "SECTOR_SEAFOOD",
  // Dệt may
  TCM: "SECTOR_TEXTILE", MSH: "SECTOR_TEXTILE", TNG: "SECTOR_TEXTILE", STK: "SECTOR_TEXTILE", GIL: "SECTOR_TEXTILE",
  // Săm lốp
  DRC: "SECTOR_TIRE", CSM: "SECTOR_TIRE",
  // KCN - cao su
  GVR: "SECTOR_INDUSTRIAL", PHR: "SECTOR_INDUSTRIAL", DPR: "SECTOR_INDUSTRIAL", KBC: "SECTOR_INDUSTRIAL", IDC: "SECTOR_INDUSTRIAL", BCM: "SECTOR_INDUSTRIAL", SIP: "SECTOR_INDUSTRIAL",
  // Nhựa
  BMP: "SECTOR_PLASTIC", NTP: "SECTOR_PLASTIC", AAA: "SECTOR_PLASTIC",
};

// Hàng hóa có sàn miễn phí Yahoo Finance (lấy giá đóng cửa gần nhất + %). Loại không có → web_search.
const YAHOO: Record<string, string> = {
  GIA_THEP_HRC: "HRC=F", GIA_DAU_BRENT: "BZ=F", GIA_KHI_GAS: "NG=F", GIA_NHIEN_BAY: "HO=F",
  GIA_DUONG: "SB=F", GIA_KHO_DAU: "ZM=F", GIA_NGO: "ZC=F", GIA_HEO_HOI: "HE=F", GIA_BONG: "CT=F",
};

interface Quote { price: number; chgPct: number | null; date: string }

async function fetchYahoo(ticker: string): Promise<Quote | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=7d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const closes: number[] = (r?.indicators?.quote?.[0]?.close ?? []).filter((v: number | null) => v != null);
    const ts: number[] = r?.timestamp ?? [];
    if (!closes.length) return null;
    const price = closes[closes.length - 1];
    const prev = closes.length > 1 ? closes[closes.length - 2] : null;
    return {
      price,
      chgPct: prev ? ((price - prev) / prev) * 100 : null,
      date: ts.length ? new Date(ts[ts.length - 1] * 1000).toISOString().slice(0, 10) : "",
    };
  } catch { return null; }
}

// Lấy giá thật cho danh sách commodity id (song song). Trả map id → cell hiển thị.
async function priceCells(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids)];
  const out: Record<string, string> = {};
  await Promise.all(uniq.map(async (id) => {
    const yf = YAHOO[id];
    if (!yf) { out[id] = "cần web_search (Trading Economics/Platts)"; return; }
    const q = await fetchYahoo(yf);
    out[id] = q
      ? `**${q.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}**${q.chgPct != null ? ` (${q.chgPct >= 0 ? "+" : ""}${q.chgPct.toFixed(1)}%)` : ""} · ${q.date}`
      : "n/a";
  }));
  return out;
}

async function chainLines(sym: string, sector: string): Promise<string[]> {
  const c = SECTOR_CHAIN[sector];
  if (!c) return [];
  const peers = Object.entries(TICKER_SECTOR).filter(([t, s]) => s === sector && t !== sym).map(([t]) => t);
  const prices = await priceCells([...c.inputs, ...c.outputs]);
  const out: string[] = [`## Chuỗi giá trị & yếu tố tác động: ${sym} — Ngành ${c.label}`];
  if (peers.length) out.push(`Cùng ngành: ${peers.join(", ")}`);

  if (c.inputs.length) {
    out.push(`\n### ⬇️ ĐẦU VÀO (chi phí — giá tăng làm GIẢM biên lợi nhuận)`);
    out.push("| Nguyên liệu | Đơn vị | Giá hiện tại | Nguồn |", "|---|---|---|---|");
    for (const id of c.inputs) { const m = COMMODITY[id]; if (m) out.push(`| ${m.name} | ${m.unit} | ${prices[id] ?? "n/a"} | ${m.source} |`); }
  }
  if (c.outputs.length) {
    out.push(`\n### ⬆️ ĐẦU RA (sản phẩm — giá tăng làm TĂNG doanh thu/lợi nhuận)`);
    out.push("| Sản phẩm | Đơn vị | Giá hiện tại | Nguồn |", "|---|---|---|---|");
    for (const id of c.outputs) { const m = COMMODITY[id]; if (m) out.push(`| ${m.name} | ${m.unit} | ${prices[id] ?? "n/a"} | ${m.source} |`); }
  }
  if (c.macro?.length) {
    out.push(`\n### 🌐 YẾU TỐ VĨ MÔ tác động`);
    for (const d of c.macro) out.push(`- **${d.factor}** (${d.sign === "+" ? "thuận chiều ↑" : "ngược chiều ↓"}): ${d.mechanism}`);
  }
  out.push(`\n> Cơ chế: chi phí đầu vào ↑ → biên LN ↓; giá đầu ra ↑ → LN ↑. Giá có sàn lấy realtime từ Yahoo Finance; loại "cần web_search" (quặng sắt/than cốc/urea/cước biển…) hãy gọi web_search nguồn chuyên ngành để có số mới nhất.`);
  return out;
}

/** Suy ngành cho 1 mã (map curate → fallback theo sector_name app). "" nếu không thuộc chuỗi hàng hóa. */
function resolveSector(sym: string, appSectorName?: string): string {
  let sector = TICKER_SECTOR[sym];
  if (!sector && appSectorName) {
    const s = appSectorName.toLowerCase();
    if (s.includes("vận tải")) sector = "SECTOR_LOGISTICS";
    else if (s.includes("bất động sản")) sector = "SECTOR_REALESTATE";
    else if (s.includes("tiện ích") || s.includes("năng lượng")) sector = "SECTOR_UTILITIES";
    else if (s.includes("thời trang")) sector = "SECTOR_TEXTILE";
  }
  return sector && SECTOR_CHAIN[sector] ? sector : "";
}

/** KHUNG TƯ DUY chuỗi giá trị (chỉ CẤU TRÚC nhân-quả, KHÔNG kéo giá — không network).
 *  Luôn áp dụng khi phân tích DN sản xuất; giá realtime là tool dữ liệu riêng (valueChainReport). */
export function valueChainFrame(symbol: string, appSectorName?: string): string {
  const sym = symbol.toUpperCase().trim();
  const sector = resolveSector(sym, appSectorName);
  if (!sector) return "";
  const c = SECTOR_CHAIN[sector];
  const out: string[] = [`## Khung chuỗi giá trị & yếu tố tác động: ${sym} — Ngành ${c.label}`];
  if (c.inputs.length) {
    out.push(`### ĐẦU VÀO (chi phí — giá ↑ làm GIẢM biên LN)`);
    for (const id of c.inputs) { const m = COMMODITY[id]; if (m) out.push(`- ${m.name} (${m.unit}) — nguồn: ${m.source}`); }
  }
  if (c.outputs.length) {
    out.push(`### ĐẦU RA (sản phẩm — giá ↑ làm TĂNG doanh thu/LN)`);
    for (const id of c.outputs) { const m = COMMODITY[id]; if (m) out.push(`- ${m.name} (${m.unit}) — nguồn: ${m.source}`); }
  }
  if (c.macro?.length) {
    out.push(`### YẾU TỐ VĨ MÔ tác động`);
    for (const d of c.macro) out.push(`- ${d.factor} (${d.sign === "+" ? "thuận chiều ↑" : "ngược chiều ↓"}): ${d.mechanism}`);
  }
  out.push(`> Cơ chế biên LN: chi phí đầu vào ↑ → biên ↓; giá đầu ra ↑ → LN ↑. (Khung luôn áp dụng; bật tool "Giá hàng hóa" để có SỐ giá realtime của các mục trên.)`);
  return out.join("\n");
}

/** Báo cáo chuỗi giá trị + GIÁ THẬT cho 1 mã. Trả "" nếu ngành không gắn chuỗi hàng hóa (vd ngân hàng/CN tech). */
export async function valueChainReport(_sb: unknown, symbol: string, appSectorName?: string): Promise<string> {
  const sym = symbol.toUpperCase().trim();
  const sector = resolveSector(sym, appSectorName);
  if (!sector) return "";
  return (await chainLines(sym, sector)).join("\n");
}
