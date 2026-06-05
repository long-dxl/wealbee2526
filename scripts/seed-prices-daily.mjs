/**
 * Seed prices_daily with 30 trading days of OHLCV data
 * for 20 additional VN30 symbols.
 * Run: node scripts/seed-prices-daily.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL    = process.env.SUPABASE_URL    || "https://fkwsvyzguehtsjpwmttb.supabase.co";
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// Stocks to seed with approximate current prices (VND)
const STOCKS = [
  { symbol: "VCB",  basePrice: 91200,  name: "Vietcombank" },
  { symbol: "VNM",  basePrice: 68500,  name: "Vinamilk" },
  { symbol: "VHM",  basePrice: 42000,  name: "Vinhomes" },
  { symbol: "TCB",  basePrice: 24800,  name: "Techcombank" },
  { symbol: "MSN",  basePrice: 68200,  name: "Masan Group" },
  { symbol: "MWG",  basePrice: 62100,  name: "Mobile World" },
  { symbol: "SSI",  basePrice: 31000,  name: "SSI Securities" },
  { symbol: "STB",  basePrice: 31200,  name: "Sacombank" },
  { symbol: "SHB",  basePrice: 8200,   name: "SHB" },
  { symbol: "VIC",  basePrice: 47800,  name: "Vingroup" },
  { symbol: "VPB",  basePrice: 18500,  name: "VPBank" },
  { symbol: "PLX",  basePrice: 44200,  name: "Petrolimex" },
  { symbol: "SAB",  basePrice: 168000, name: "Sabeco" },
  { symbol: "NVL",  basePrice: 8900,   name: "NovaLand" },
  { symbol: "PDR",  basePrice: 11800,  name: "Phat Dat Real Estate" },
  { symbol: "DXG",  basePrice: 14200,  name: "Dat Xanh Group" },
  { symbol: "VJC",  basePrice: 98000,  name: "VietJet Air" },
  { symbol: "KBC",  basePrice: 24500,  name: "Kinh Bac City" },
  { symbol: "GMD",  basePrice: 68000,  name: "Gemadept" },
  { symbol: "REE",  basePrice: 53000,  name: "REE Corporation" },
];

// Generate 30 trading days ending on 2026-05-27
function getTradingDays(endDate, count) {
  const days = [];
  let d = new Date(endDate);
  while (days.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.unshift(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return days;
}

// Random walk price generator
function generatePrices(basePrice, days) {
  const rows = [];
  let prev = basePrice;
  const volatility = 0.018; // 1.8% daily volatility

  for (const date of days) {
    const dailyReturn = (Math.random() - 0.48) * volatility; // slight upward bias
    const open  = Math.round(prev * (1 + (Math.random() - 0.5) * 0.005));
    const close = Math.round(prev * (1 + dailyReturn));
    const high  = Math.round(Math.max(open, close) * (1 + Math.random() * 0.008));
    const low   = Math.round(Math.min(open, close) * (1 - Math.random() * 0.008));
    const volume = Math.round((500_000 + Math.random() * 5_000_000));

    rows.push({ date, open, high, low, close, volume });
    prev = close;
  }
  return rows;
}

async function checkExisting(symbol) {
  const { count } = await supabase
    .from("prices_daily")
    .select("*", { count: "exact", head: true })
    .eq("symbol", symbol);
  return (count ?? 0) > 0;
}

async function seed() {
  const days = getTradingDays("2026-05-27", 30);
  console.log(`Seeding ${days.length} days: ${days[0]} → ${days[days.length - 1]}`);

  let totalInserted = 0;
  let skipped = 0;

  for (const stock of STOCKS) {
    const exists = await checkExisting(stock.symbol);
    if (exists) {
      console.log(`  SKIP ${stock.symbol} — already has data`);
      skipped++;
      continue;
    }

    const rows = generatePrices(stock.basePrice, days);
    const payload = rows.map(r => ({ symbol: stock.symbol, ...r }));

    const { error } = await supabase.from("prices_daily").insert(payload);
    if (error) {
      console.error(`  ERROR ${stock.symbol}:`, error.message);
    } else {
      console.log(`  ✓ ${stock.symbol} — ${rows.length} rows inserted`);
      totalInserted += rows.length;
    }
  }

  console.log(`\nDone. Inserted: ${totalInserted} rows, Skipped: ${skipped} symbols`);
}

seed().catch(console.error);
