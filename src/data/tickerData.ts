export interface TickerSummary {
  symbol: string;
  name: string;
  shortName: string;
  price: number;
  change: number;
  changePct: number;
  volume: string;
  sector: string;
  exchange: string;
}

export interface TickerDetail extends TickerSummary {
  marketCap: string;
  marketCapRaw: number;
  pe: number;
  pb: number;
  roe: number;
  de: number;
  currentRatio: number;
  avgVolume: string;
  dayLow: number;
  dayHigh: number;
  week52Low: number;
  week52High: number;
  ceo: string;
  founded: string;
  website: string;
  country: string;
  about: string;
}

export interface PricePoint {
  date: string;
  price: number;
  vni: number;
  hnx: number;
}

export interface FinancialYear {
  year: number;
  revenue: number;
  grossProfit: number;
  ebit: number;
  netIncome: number;
  eps: number;
  totalAssets: number;
  cash: number;
  totalDebt: number;
  equity: number;
  operatingCF: number;
  fcf: number;
  capex: number;
  netCashChange: number;
  pe: number;
  pb: number;
  roe: number;
  de: number;
  currentRatio: number;
  marketCap: number;
}

// ─────────────────────────────────────────────────────────────
// Ticker list
// ─────────────────────────────────────────────────────────────
export const TICKER_LIST: TickerSummary[] = [
  { symbol: "VCB",  name: "Ngân hàng TMCP Ngoại thương Việt Nam", shortName: "Vietcombank",     price: 91200,  change: 720,   changePct: 0.80,  volume: "8.2M",  sector: "Ngân hàng",    exchange: "HOSE" },
  { symbol: "BID",  name: "Ngân hàng TMCP Đầu tư và Phát triển",  shortName: "BIDV",            price: 48500,  change: 300,   changePct: 0.62,  volume: "6.5M",  sector: "Ngân hàng",    exchange: "HOSE" },
  { symbol: "HPG",  name: "CTCP Tập đoàn Hoà Phát",               shortName: "Hòa Phát Group",  price: 26500,  change: 1050,  changePct: 4.10,  volume: "12.4M", sector: "Thép",         exchange: "HOSE" },
  { symbol: "HSG",  name: "CTCP Tập đoàn Hoa Sen",                shortName: "Hoa Sen Group",   price: 18200,  change: 500,   changePct: 2.80,  volume: "7.3M",  sector: "Thép",         exchange: "HOSE" },
  { symbol: "FPT",  name: "CTCP FPT",                             shortName: "FPT Corporation", price: 128400, change: 1840,  changePct: 1.45,  volume: "5.1M",  sector: "Công nghệ",    exchange: "HOSE" },
  { symbol: "MWG",  name: "CTCP Đầu tư Thế Giới Di Động",         shortName: "Mobile World",    price: 62100,  change: -2050, changePct: -3.20, volume: "8.1M",  sector: "Bán lẻ",       exchange: "HOSE" },
  { symbol: "VNM",  name: "CTCP Sữa Việt Nam",                    shortName: "Vinamilk",        price: 68900,  change: -300,  changePct: -0.43, volume: "3.2M",  sector: "Thực phẩm",    exchange: "HOSE" },
  { symbol: "VIC",  name: "Tập đoàn Vingroup",                    shortName: "Vingroup",        price: 47800,  change: 1750,  changePct: 3.80,  volume: "9.2M",  sector: "Bất động sản", exchange: "HOSE" },
  { symbol: "DXG",  name: "CTCP Tập đoàn Đất Xanh",              shortName: "Đất Xanh Group",  price: 14200,  change: -420,  changePct: -2.90, volume: "5.6M",  sector: "Bất động sản", exchange: "HOSE" },
  { symbol: "TCB",  name: "Ngân hàng TMCP Kỹ thương Việt Nam",    shortName: "Techcombank",     price: 24800,  change: 580,   changePct: 2.40,  volume: "8.4M",  sector: "Ngân hàng",    exchange: "HOSE" },
  { symbol: "MSN",  name: "CTCP Tập đoàn Masan",                  shortName: "Masan Group",     price: 68200,  change: 1930,  changePct: 2.91,  volume: "6.8M",  sector: "Hàng tiêu dùng", exchange: "HOSE" },
  { symbol: "STB",  name: "Ngân hàng TMCP Sài Gòn Thương Tín",   shortName: "Sacombank",       price: 31200,  change: 2050,  changePct: 7.00,  volume: "5.1M",  sector: "Ngân hàng",    exchange: "HOSE" },
  { symbol: "ACB",  name: "Ngân hàng TMCP Á Châu",               shortName: "ACB",             price: 22100,  change: 250,   changePct: 1.14,  volume: "7.6M",  sector: "Ngân hàng",    exchange: "HOSE" },
  { symbol: "NVL",  name: "CTCP Tập đoàn Đầu tư Địa ốc No Va",  shortName: "Novaland",        price: 8900,   change: -230,  changePct: -2.50, volume: "3.8M",  sector: "Bất động sản", exchange: "HOSE" },
  { symbol: "PDR",  name: "CTCP Phát triển Bất động sản Phát Đạt",shortName: "Phát Đạt",       price: 11800,  change: -890,  changePct: -7.00, volume: "5.6M",  sector: "Bất động sản", exchange: "HOSE" },
];

// ─────────────────────────────────────────────────────────────
// Extended detail data per ticker
// ─────────────────────────────────────────────────────────────
const DETAIL_MAP: Record<string, Omit<TickerDetail, keyof TickerSummary>> = {
  VCB: {
    marketCap: "232.4 nghìn tỷ", marketCapRaw: 232400,
    pe: 14.2, pb: 2.8, roe: 20.4, de: 0.82, currentRatio: 1.18,
    avgVolume: "7.5M", dayLow: 90100, dayHigh: 91800, week52Low: 72300, week52High: 98500,
    ceo: "Nguyễn Thanh Tùng", founded: "01/04/1963", website: "www.vietcombank.com.vn",
    country: "Việt Nam",
    about: "Vietcombank là ngân hàng thương mại nhà nước lớn nhất Việt Nam về vốn hóa thị trường, cung cấp đầy đủ dịch vụ ngân hàng bán lẻ và bán buôn, thanh toán quốc tế và kinh doanh ngoại hối. Ngân hàng sở hữu mạng lưới hơn 500 chi nhánh và phòng giao dịch trên toàn quốc.",
  },
  HPG: {
    marketCap: "155.2 nghìn tỷ", marketCapRaw: 155200,
    pe: 11.4, pb: 1.6, roe: 15.8, de: 0.65, currentRatio: 1.42,
    avgVolume: "11.8M", dayLow: 25900, dayHigh: 26800, week52Low: 19200, week52High: 29400,
    ceo: "Trần Đình Long", founded: "08/09/1992", website: "www.hoaphat.com.vn",
    country: "Việt Nam",
    about: "Tập đoàn Hòa Phát là tập đoàn sản xuất công nghiệp tư nhân lớn nhất Việt Nam, hoạt động chính trong lĩnh vực sản xuất thép xây dựng, thép cuộn cán nóng (HRC), nội thất và bất động sản. Công ty là nhà sản xuất thép lớn nhất Đông Nam Á với tổng công suất trên 14 triệu tấn/năm.",
  },
  FPT: {
    marketCap: "191.8 nghìn tỷ", marketCapRaw: 191800,
    pe: 22.1, pb: 5.4, roe: 26.2, de: 0.38, currentRatio: 1.85,
    avgVolume: "4.8M", dayLow: 127200, dayHigh: 129500, week52Low: 98400, week52High: 135800,
    ceo: "Nguyễn Văn Khoa", founded: "13/09/1988", website: "www.fpt.com.vn",
    country: "Việt Nam",
    about: "FPT Corporation là tập đoàn công nghệ hàng đầu Việt Nam, hoạt động trong ba mảng chiến lược: Công nghệ (phần mềm, dịch vụ CNTT xuất khẩu), Viễn thông và Internet, Giáo dục. FPT Software là đơn vị xuất khẩu phần mềm lớn nhất Việt Nam với khách hàng tại 50+ quốc gia.",
  },
  TCB: {
    marketCap: "88.6 nghìn tỷ", marketCapRaw: 88600,
    pe: 9.8, pb: 1.7, roe: 18.2, de: 0.71, currentRatio: 1.12,
    avgVolume: "7.9M", dayLow: 24200, dayHigh: 25100, week52Low: 18900, week52High: 27600,
    ceo: "Nguyễn Lê Quốc Anh", founded: "27/09/1993", website: "www.techcombank.com.vn",
    country: "Việt Nam",
    about: "Techcombank là một trong những ngân hàng thương mại cổ phần tư nhân lớn nhất Việt Nam, nổi bật với chiến lược ngân hàng số và hệ sinh thái tài chính khép kín. Ngân hàng sở hữu nền tảng khách hàng trung lưu và thượng lưu với tỷ lệ CASA cao nhất ngành.",
  },
  VNM: {
    marketCap: "144.3 nghìn tỷ", marketCapRaw: 144300,
    pe: 18.6, pb: 4.1, roe: 22.8, de: 0.12, currentRatio: 2.65,
    avgVolume: "3.0M", dayLow: 68100, dayHigh: 69500, week52Low: 62400, week52High: 78200,
    ceo: "Lê Thị Thanh Lâm", founded: "20/08/1976", website: "www.vinamilk.com.vn",
    country: "Việt Nam",
    about: "Vinamilk là doanh nghiệp sản xuất và kinh doanh sữa lớn nhất Việt Nam, chiếm hơn 55% thị phần sữa nước và 80% thị phần sữa bột trẻ em. Công ty vận hành 13 nhà máy sản xuất và hơn 500 trang trại liên kết trên toàn quốc.",
  },
};

function fallbackDetail(t: TickerSummary): Omit<TickerDetail, keyof TickerSummary> {
  return {
    marketCap: `${(t.price * 6000 / 1e9).toFixed(1)} nghìn tỷ`,
    marketCapRaw: Math.round(t.price * 6000 / 1e6),
    pe: 10 + Math.abs(t.changePct) * 2,
    pb: 1.2 + Math.abs(t.changePct) * 0.3,
    roe: 12 + Math.abs(t.changePct),
    de: 0.5 + Math.abs(t.changePct) * 0.1,
    currentRatio: 1.2,
    avgVolume: t.volume,
    dayLow: Math.round(t.price * 0.987 / 100) * 100,
    dayHigh: Math.round(t.price * 1.013 / 100) * 100,
    week52Low: Math.round(t.price * 0.76 / 100) * 100,
    week52High: Math.round(t.price * 1.24 / 100) * 100,
    ceo: "Chưa cập nhật",
    founded: "01/01/2000",
    website: `www.${t.symbol.toLowerCase()}.com.vn`,
    country: "Việt Nam",
    about: `${t.shortName} hoạt động trong lĩnh vực ${t.sector} tại Việt Nam, niêm yết trên sàn ${t.exchange}.`,
  };
}

export function getTickerDetail(symbol: string): TickerDetail | null {
  const base = TICKER_LIST.find((t) => t.symbol === symbol);
  if (!base) return null;
  const extra = DETAIL_MAP[symbol] ?? fallbackDetail(base);
  return { ...base, ...extra };
}

// ─────────────────────────────────────────────────────────────
// Price history generator (deterministic mock)
// ─────────────────────────────────────────────────────────────
export type Period = "5D" | "1M" | "3M" | "YTD" | "5Y";

function periodDays(p: Period): number {
  switch (p) {
    case "5D":  return 5;
    case "1M":  return 22;
    case "3M":  return 66;
    case "YTD": return 96;
    case "5Y":  return 1260;
  }
}

export function getPriceHistory(symbol: string, period: Period): PricePoint[] {
  const ticker = TICKER_LIST.find((t) => t.symbol === symbol);
  if (!ticker) return [];

  const days = periodDays(period);
  const seed = symbol.charCodeAt(0) * 0.0013 + symbol.charCodeAt(1) * 0.0007;
  const endPrice = ticker.price;

  const points: PricePoint[] = [];
  const startRatio = period === "5Y" ? 0.45 : period === "YTD" ? 0.80 : 0.88;
  let price = endPrice * startRatio;
  let vni = 1250 * startRatio;
  let hnx = 235 * startRatio;

  const now = new Date(2026, 4, 15); // May 15 2026
  let tradingDayCount = 0;

  for (let i = days * 1.5; i >= 0 && tradingDayCount < days; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - Math.round(i));
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    tradingDayCount++;

    const t = tradingDayCount / days;
    const base = startRatio + (1 - startRatio) * t;
    const noise = Math.sin(i * seed * 7.3 + 1.2) * 0.018
                + Math.cos(i * 0.41 + seed * 3) * 0.009
                + Math.sin(i * 0.17) * 0.006;

    price = endPrice * (base + noise * (1 - t * 0.4));
    vni   = 1250 * (base + Math.sin(i * 0.11 + 0.5) * 0.012 + noise * 0.5);
    hnx   = 235  * (base + Math.sin(i * 0.09 + 0.8) * 0.010 + noise * 0.4);

    const label = date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: period === "5Y" ? "short" : "2-digit",
    });

    points.push({
      date: label,
      price: Math.round(price / 100) * 100,
      vni:   Math.round(vni * 10) / 10,
      hnx:   Math.round(hnx * 10) / 10,
    });
  }
  return points;
}

// ─────────────────────────────────────────────────────────────
// Financial statements (tỷ VND, trừ EPS = VND)
// ─────────────────────────────────────────────────────────────
const FINANCIALS_MAP: Record<string, FinancialYear[]> = {
  HPG: [
    { year: 2021, revenue: 114483, grossProfit: 27042, ebit: 22140, netIncome: 19764, eps: 3185, totalAssets: 152340, cash: 18200, totalDebt: 58400, equity: 73200, operatingCF: 24100, fcf: 12400, capex: -11700, netCashChange: 2800, pe: 8.4, pb: 1.4, roe: 32.1, de: 0.80, currentRatio: 1.38, marketCap: 125000 },
    { year: 2022, revenue: 140215, grossProfit: 18240, ebit: 12800, netIncome: 8600,  eps: 1385, totalAssets: 168400, cash: 14500, totalDebt: 72100, equity: 78400, operatingCF: 9800,  fcf: -2400, capex: -12200, netCashChange: -3700, pe: 12.1, pb: 1.2, roe: 11.2, de: 0.92, currentRatio: 1.22, marketCap: 86000 },
    { year: 2023, revenue: 121630, grossProfit: 19800, ebit: 14200, netIncome: 7240,  eps: 1166, totalAssets: 175200, cash: 16800, totalDebt: 68200, equity: 84600, operatingCF: 18400, fcf: 7200,  capex: -11200, netCashChange: 2300,  pe: 14.8, pb: 1.3, roe: 8.9,  de: 0.81, currentRatio: 1.31, marketCap: 112000 },
    { year: 2024, revenue: 132480, grossProfit: 22400, ebit: 17800, netIncome: 10200, eps: 1643, totalAssets: 188400, cash: 20400, totalDebt: 62400, equity: 96200, operatingCF: 21800, fcf: 10200, capex: -11600, netCashChange: 3600,  pe: 13.2, pb: 1.5, roe: 11.4, de: 0.65, currentRatio: 1.38, marketCap: 140000 },
    { year: 2025, revenue: 145800, grossProfit: 26100, ebit: 21200, netIncome: 12800, eps: 2061, totalAssets: 198600, cash: 24800, totalDebt: 58800, equity: 108400, operatingCF: 25400, fcf: 14200, capex: -11200, netCashChange: 4400, pe: 11.4, pb: 1.6, roe: 15.8, de: 0.54, currentRatio: 1.42, marketCap: 155200 },
  ],
  FPT: [
    { year: 2021, revenue: 35657,  grossProfit: 14280, ebit: 5840,  netIncome: 4920,  eps: 3304, totalAssets: 42400, cash: 8200, totalDebt: 6800,  equity: 22400, operatingCF: 6200,  fcf: 4800,  capex: -1400, netCashChange: 1200, pe: 18.2, pb: 4.1, roe: 23.4, de: 0.30, currentRatio: 2.10, marketCap: 98000  },
    { year: 2022, revenue: 44017,  grossProfit: 17600, ebit: 7200,  netIncome: 6120,  eps: 4108, totalAssets: 52400, cash: 10200, totalDebt: 8400, equity: 27400, operatingCF: 7800,  fcf: 6100,  capex: -1700, netCashChange: 1800, pe: 16.4, pb: 4.4, roe: 24.2, de: 0.31, currentRatio: 2.18, marketCap: 128000 },
    { year: 2023, revenue: 52360,  grossProfit: 20940, ebit: 8640,  netIncome: 7280,  eps: 4887, totalAssets: 64200, cash: 12800, totalDebt: 9800, equity: 32800, operatingCF: 9200,  fcf: 7400,  capex: -1800, netCashChange: 2000, pe: 19.8, pb: 4.8, roe: 24.8, de: 0.30, currentRatio: 2.24, marketCap: 152000 },
    { year: 2024, revenue: 60840,  grossProfit: 24336, ebit: 10040, netIncome: 8480,  eps: 5693, totalAssets: 76800, cash: 15400, totalDebt: 10400, equity: 38400, operatingCF: 10800, fcf: 8800,  capex: -2000, netCashChange: 2400, pe: 21.4, pb: 5.1, roe: 25.4, de: 0.27, currentRatio: 2.40, marketCap: 174000 },
    { year: 2025, revenue: 70240,  grossProfit: 28096, ebit: 11680, netIncome: 9840,  eps: 6607, totalAssets: 89400, cash: 18200, totalDebt: 10800, equity: 44600, operatingCF: 12400, fcf: 10200, capex: -2200, netCashChange: 2800, pe: 22.1, pb: 5.4, roe: 26.2, de: 0.24, currentRatio: 2.58, marketCap: 191800 },
  ],
  VCB: [
    { year: 2021, revenue: 36420,  grossProfit: 28800, ebit: 18200, netIncome: 14800, eps: 3780, totalAssets: 1204000, cash: 82000, totalDebt: 168000, equity: 84200, operatingCF: 16400, fcf: 14800, capex: -1600, netCashChange: 2800, pe: 18.2, pb: 3.2, roe: 18.2, de: 0.82, currentRatio: 1.12, marketCap: 248000 },
    { year: 2022, revenue: 42180,  grossProfit: 33200, ebit: 21200, netIncome: 17200, eps: 4394, totalAssets: 1424000, cash: 96000, totalDebt: 196000, equity: 96400, operatingCF: 19200, fcf: 17600, capex: -1600, netCashChange: 3600, pe: 15.4, pb: 2.6, roe: 19.4, de: 0.84, currentRatio: 1.14, marketCap: 242000 },
    { year: 2023, revenue: 46840,  grossProfit: 36800, ebit: 23800, netIncome: 19400, eps: 4956, totalAssets: 1648000, cash: 104000, totalDebt: 218000, equity: 108400, operatingCF: 21800, fcf: 20000, capex: -1800, netCashChange: 4200, pe: 14.8, pb: 2.4, roe: 19.8, de: 0.83, currentRatio: 1.15, marketCap: 228000 },
    { year: 2024, revenue: 52400,  grossProfit: 41200, ebit: 26800, netIncome: 21800, eps: 5568, totalAssets: 1892000, cash: 118000, totalDebt: 244000, equity: 122000, operatingCF: 24400, fcf: 22400, capex: -2000, netCashChange: 4800, pe: 14.6, pb: 2.7, roe: 20.1, de: 0.82, currentRatio: 1.17, marketCap: 226000 },
    { year: 2025, revenue: 58240,  grossProfit: 45800, ebit: 30200, netIncome: 24400, eps: 6234, totalAssets: 2148000, cash: 132000, totalDebt: 268000, equity: 136400, operatingCF: 27200, fcf: 25000, capex: -2200, netCashChange: 5400, pe: 14.2, pb: 2.8, roe: 20.4, de: 0.82, currentRatio: 1.18, marketCap: 232400 },
  ],
};

function generateFinancials(ticker: TickerSummary): FinancialYear[] {
  const seed = ticker.symbol.charCodeAt(0);
  const baseRev = ticker.price * 0.8;
  return [2021, 2022, 2023, 2024, 2025].map((year, i) => {
    const g = 1 + i * 0.10 + Math.sin(seed * 0.1 + i) * 0.04;
    const rev = Math.round(baseRev * g / 10) * 10;
    const gp = Math.round(rev * 0.32);
    const ebit = Math.round(rev * 0.14);
    const ni = Math.round(rev * 0.10);
    const eps = Math.round((ni * 1e9) / 621e6);
    const assets = Math.round(rev * 1.4);
    const equity = Math.round(assets * 0.45);
    return {
      year, revenue: rev, grossProfit: gp, ebit, netIncome: ni, eps,
      totalAssets: assets, cash: Math.round(assets * 0.12), totalDebt: Math.round(assets * 0.30), equity,
      operatingCF: Math.round(ni * 1.2), fcf: Math.round(ni * 0.85), capex: -Math.round(ni * 0.35), netCashChange: Math.round(ni * 0.2),
      pe: 10 + i * 0.8, pb: 1.2 + i * 0.2, roe: 12 + i, de: 0.7 - i * 0.04, currentRatio: 1.2 + i * 0.05,
      marketCap: Math.round(rev * 1.1),
    };
  });
}

export function getFinancials(symbol: string): FinancialYear[] {
  if (FINANCIALS_MAP[symbol]) return FINANCIALS_MAP[symbol];
  const ticker = TICKER_LIST.find((t) => t.symbol === symbol);
  return ticker ? generateFinancials(ticker) : [];
}
