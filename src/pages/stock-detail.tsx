import { useParams, Link, useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, Calendar, DollarSign, Shield, BarChart3, Search, Info, Activity, Sparkles, Loader2 } from 'lucide-react';
import { getStockBySymbol, searchStocks } from '../lib/services/stocks-service';
import { Stock } from '../lib/types';
import { supabase } from '../lib/supabase/client';

const db = supabase as any;
import { formatVND, formatPercent, formatDate, getSafetyColor, getSafetyLabel } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, ReferenceLine } from 'recharts';
import { FinancialChart } from '../components/FinancialChart';
import { StockAISidebar } from '../components/StockAISidebar';
import {
  payoutRatioColorLogic,
  sharesOutstandingColorLogic,
  fcfColorLogic,
  epsColorLogic,
  revenueColorLogic,
  netIncomeColorLogic
} from '../lib/financial-health-data';

type TimeFrame = '1M' | '3M' | '1Y' | '5Y';

export function StockDetail() {
  const { ticker } = useParams();
  const navigate = useNavigate();

  const [stock, setStock] = useState<Stock | null>(null);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<Stock[]>([]);

  const [activeTab, setActiveTab] = useState<'overview' | 'dividend' | 'fundamentals'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1Y');
  const [isAISidebarOpen, setIsAISidebarOpen] = useState(false);

  // Price history from market_data_stock_history
  const [priceHistory, setPriceHistory] = useState<{ date: string; price: number }[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);

  // Fundamentals from market_stocks_fundamentals (SELECT *)
  const [fundamentalsRow, setFundamentalsRow] = useState<Record<string, any> | null>(null);

  // Fetch stock data when ticker changes
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setStockLoading(true);
    setStockError(null);
    getStockBySymbol(ticker).then(data => {
      if (cancelled) return;
      setStock(data);
      setStockLoading(false);
    }).catch(err => {
      if (cancelled) return;
      setStockError(err?.message ?? 'Lỗi tải dữ liệu');
      setStockLoading(false);
    });
    return () => { cancelled = true; };
  }, [ticker]);

  // Fetch search suggestions when query changes
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
      setSearchSuggestions([]);
      return;
    }
    let cancelled = false;
    searchStocks(searchQuery).then(results => {
      if (cancelled) return;
      setSearchSuggestions(results.slice(0, 5));
    }).catch(() => {
      if (cancelled) return;
      setSearchSuggestions([]);
    });
    return () => { cancelled = true; };
  }, [searchQuery]);

  // Fetch fundamentals from market_stocks_fundamentals
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    db.from('market_stocks_fundamentals')
      .select('*')
      .eq('symbol', ticker.toUpperCase())
      .single()
      .then(({ data }: { data: Record<string, any> | null }) => {
        if (!cancelled) setFundamentalsRow(data ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticker]);

  // Fetch price history from market_data_stock_history
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setPriceLoading(true);
    setPriceHistory([]);

    const daysByFrame: Record<TimeFrame, number> = { '1M': 30, '3M': 90, '1Y': 365, '5Y': 1825 };
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysByFrame[timeFrame]);
    const fromStr = fromDate.toISOString().split('T')[0];

    db.from('market_data_stock_history')
      .select('trading_date, adjusted_close')
      .eq('symbol', ticker.toUpperCase())
      .gte('trading_date', fromStr)
      .order('trading_date', { ascending: true })
      .then(({ data, error }: { data: { trading_date: string; adjusted_close: number }[] | null; error: unknown }) => {
        if (cancelled) return;
        setPriceHistory(
          error || !data ? [] : data.map(r => ({ date: r.trading_date, price: Number(r.adjusted_close) }))
        );
        setPriceLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setPriceHistory([]); setPriceLoading(false); }
      });

    return () => { cancelled = true; };
  }, [ticker, timeFrame]);

  if (stockLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Loader2 className="size-8 animate-spin text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  }

  if (stockError || !stock) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-12 shadow-sm border border-gray-200 dark:border-slate-700 dark:border-slate-700 text-center">
          <p className="text-gray-500 dark:text-slate-400">{stockError ?? `Không tìm thấy mã cổ phiếu ${ticker}`}</p>
          <Link to="/markets" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:text-emerald-400 mt-4 inline-block">
            Quay lại Markets Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const handleSearchSelect = (selectedTicker: string) => {
    setSearchQuery('');
    setShowSearchSuggestions(false);
    navigate(`/app/stock/${selectedTicker}`);
  };

  // ── Real fundamentals from Supabase ──────────────────────────────────────────
  const f = fundamentalsRow;

  // Helper: numeric field with fallback
  const fNum = (field: string, fallback = 0) => Number(f?.[field] ?? fallback) || fallback;

  // Calculated from stock (already real data from market_data_stocks)
  const revenueTTM = stock.revenueYoY;     // mapped from revenue_ttm
  const netIncomeTTM = stock.netIncomeYoY; // mapped from net_income_ttm
  const fcfTTM = stock.fcfYoY;             // mapped from free_cash_flow
  const ebitdaTTM = stock.ebitdaYoY;       // mapped from ebitda_ttm

  const netMarginCalc = revenueTTM > 0 ? (netIncomeTTM / revenueTTM) * 100 : 0;
  const ebitdaMarginCalc = revenueTTM > 0 && ebitdaTTM > 0 ? (ebitdaTTM / revenueTTM) * 100 : 0;

  const fundamentalsData = {
    margins: {
      grossMargin: fNum('gross_margin'),
      operatingMargin: fNum('operating_margin'),
      netMargin: netMarginCalc,
      ebitdaMargin: ebitdaMarginCalc,
    },
    efficiency: {
      roa: fNum('roa') || fNum('return_on_assets'),
      roe: fNum('roe') || fNum('return_on_equity'),
      roic: fNum('roic') || fNum('return_on_invested_capital'),
      assetTurnover: fNum('asset_turnover'),
    },
    leverage: {
      debtToEquity: stock.debtToEquity,
      debtToAssets: fNum('debt_to_assets'),
      currentRatio: fNum('current_ratio'),
      quickRatio: fNum('quick_ratio'),
    },
  };

  // EPS TTM: reverse from payoutRatio + annualPayout
  const epsTTM = stock.payoutRatio > 0 ? stock.annualPayout / (stock.payoutRatio / 100) : 0;

  // PE: prefer fundamentals field, fall back to price/EPS
  const peCalc = epsTTM > 0 ? stock.price / epsTTM : 0;
  const peVal = fNum('pe_ratio') || fNum('pe_ttm') || peCalc;

  // PS: market cap / revenue
  const psCalc = revenueTTM > 0 && stock.marketCap > 0 ? stock.marketCap / revenueTTM : 0;

  // Price/FCF: market cap / FCF
  const pfcfCalc = fcfTTM > 0 && stock.marketCap > 0 ? stock.marketCap / fcfTTM : 0;

  // EV/EBITDA: prefer fundamentals, fall back to market_cap/ebitda
  const evEbitdaCalc = ebitdaTTM > 0 && stock.marketCap > 0 ? stock.marketCap / ebitdaTTM : 0;

  const valuationData = {
    pe: peVal,
    forwardPE: fNum('forward_pe') || fNum('forward_pe_ratio') || peVal,
    ps: fNum('ps_ratio') || fNum('price_to_sales') || psCalc,
    pb: fNum('pb_ratio') || fNum('price_to_book'),
    peg: fNum('peg_ratio'),
    evToEbitda: fNum('ev_to_ebitda') || evEbitdaCalc,
    evToSales: fNum('ev_to_revenue') || fNum('ev_to_sales') || psCalc,
    priceToFCF: pfcfCalc,
  };

  // ── FinancialChart data (TTM — single period) ─────────────────────────────
  const currentYear = new Date().getFullYear().toString();
  const sharesM = stock.price > 0 && stock.marketCap > 0
    ? Math.round(stock.marketCap / stock.price / 1_000_000)
    : 0;

  const epsChartData = epsTTM > 0
    ? [{ year: 'TTM', value: Math.round(epsTTM), yoyGrowth: 0 }] : [];
  const payoutChartData = stock.payoutRatio > 0
    ? [{ year: 'TTM', value: stock.payoutRatio, yoyGrowth: 0 }] : [];
  const fcfChartData = fcfTTM > 0
    ? [{ year: 'TTM', value: fcfTTM, yoyGrowth: 0 }] : [];
  const sharesChartData = sharesM > 0
    ? [{ year: currentYear, value: sharesM, yoyGrowth: 0 }] : [];
  const revenueChartData = revenueTTM > 0
    ? [{ year: 'TTM', value: revenueTTM, yoyGrowth: 0 }] : [];
  const netIncomeChartData = netIncomeTTM > 0
    ? [{ year: 'TTM', value: netIncomeTTM, yoyGrowth: 0 }] : [];

  // Tooltips for metrics
  const metricTooltips: Record<string, string> = {
    grossMargin: 'Biên lợi nhuận gộp = (Doanh thu - Giá vốn) / Doanh thu × 100%',
    operatingMargin: 'Biên lợi nhuận hoạt động = Lợi nhuận hoạt động / Doanh thu × 100%',
    netMargin: 'Biên lợi nhuận ròng = Lợi nhuận ròng / Doanh thu × 100%',
    ebitdaMargin: 'Biên EBITDA = EBITDA / Doanh thu × 100%',
    roa: 'ROA (Return on Assets) = Lợi nhuận ròng / Tổng tài sản × 100%',
    roe: 'ROE (Return on Equity) = Lợi nhuận ròng / Vốn chủ sở hữu × 100%',
    roic: 'ROIC = NOPAT / (Vốn chủ + Nợ dài hạn) × 100%',
    assetTurnover: 'Vòng quay tài sản = Doanh thu / Tổng tài sản',
    debtToEquity: 'Nợ/Vốn = Tổng nợ / Vốn chủ sở hữu',
    debtToAssets: 'Nợ/Tài sản = Tổng nợ / Tổng tài sản',
    currentRatio: 'Khả năng thanh toán hiện hành = Tài sản ngắn hạn / Nợ ngắn hạn',
    quickRatio: 'Khả năng thanh toán nhanh = (Tài sản NH - Hàng tồn kho) / Nợ ngắn hạn',
    pe: 'P/E (Price to Earnings) = Giá cổ phiếu / EPS',
    forwardPE: 'Forward P/E = Giá hiện tại / EPS dự phóng năm tới',
    ps: 'P/S (Price to Sales) = Vốn hóa / Doanh thu',
    pb: 'P/B (Price to Book) = Giá cổ phiếu / Giá trị sổ sách/CP',
    peg: 'PEG = P/E / Tốc độ tăng trưởng lợi nhuận (%)',
    evToEbitda: 'EV/EBITDA = Giá trị doanh nghiệp / EBITDA',
    evToSales: 'EV/Sales = Giá trị doanh nghiệp / Doanh thu',
    priceToFCF: 'P/FCF = Vốn hóa / Dòng tiền tự do'
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header with Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <Link to="/app/markets" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-3">
              <span className="text-emerald-700 dark:text-emerald-400">{stock.ticker}</span>
              <span className="text-gray-400 dark:text-slate-500">|</span>
              <span>{stock.name}</span>
            </h1>
            <p className="text-sm text-gray-600 dark:text-slate-300">{stock.sector} • {stock.exchange}</p>
          </div>
        </div>
        
        {/* AI Analysis Button */}
        <button
          onClick={() => setIsAISidebarOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md hover:shadow-lg font-medium"
        >
          <Sparkles className="size-5" />
          <span>Phân tích với Bee AI</span>
        </button>
        
        {/* Search Bar */}
        <div className="relative w-full max-w-xs">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Tìm mã cổ phiếu..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchSuggestions(true);
              }}
              onFocus={() => setShowSearchSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 200)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400"
            />
          </div>
          
          {/* Search Suggestions */}
          {showSearchSuggestions && searchQuery && searchSuggestions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 dark:border-slate-700 dark:border-slate-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {searchSuggestions.map((s) => (
                <button
                  key={s.ticker}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSearchSelect(s.ticker);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors border-b border-gray-100 dark:border-slate-700/50 last:border-b-0"
                >
                  <div className="font-medium text-sm text-emerald-700 dark:text-emerald-400">{s.ticker}</div>
                  <div className="text-xs text-gray-600 dark:text-slate-300">{s.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 dark:border-slate-700 dark:border-slate-700">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-2 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'overview'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
            }`}
          >
            Tổng quan
          </button>
          <button
            onClick={() => setActiveTab('dividend')}
            className={`py-3 px-2 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'dividend'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
            }`}
          >
            Cổ tức
          </button>
          <button
            onClick={() => setActiveTab('fundamentals')}
            className={`py-3 px-2 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'fundamentals'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
            }`}
          >
            Chỉ số cơ bản
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 5 Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700 dark:border-slate-700">
              <h3 className="text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Vốn hóa</h3>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {(stock.marketCap / 1000000000000).toFixed(1)}T
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700 dark:border-slate-700">
              <h3 className="text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">P/E hiện tại</h3>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {valuationData.pe > 0 ? valuationData.pe.toFixed(1) : 'N/A'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700 dark:border-slate-700">
              <h3 className="text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">P/E dự phóng</h3>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {valuationData.forwardPE > 0 ? valuationData.forwardPE.toFixed(1) : 'N/A'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700 dark:border-slate-700">
              <h3 className="text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Tỷ suất cổ tức</h3>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {stock.dividendYield > 0 ? `${stock.dividendYield.toFixed(1)}%` : 'N/A'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-slate-700 dark:border-slate-700">
              <h3 className="text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Mức chi trả</h3>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {stock.payoutRatio > 0 ? `${stock.payoutRatio}%` : 'N/A'}
              </p>
            </div>
          </div>

          {/* Interactive Price Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-slate-700 dark:border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold flex items-center gap-2">
                <TrendingUp className="size-5 text-emerald-600 dark:text-emerald-400" />
                Biểu đồ giá
              </h2>
              
              {/* Timeframe Selector */}
              <div className="flex gap-2">
                {(['1M', '3M', '1Y', '5Y'] as TimeFrame[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeFrame(tf)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      timeFrame === tf
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Chart — real data from market_data_stock_history */}
            {priceLoading ? (
              <div className="flex items-center justify-center h-[400px] bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                <Loader2 className="size-8 animate-spin text-emerald-500" />
              </div>
            ) : priceHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={priceHistory}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    minTickGap={40}
                    tickFormatter={(value: string) => {
                      const d = new Date(value);
                      return timeFrame === '5Y'
                        ? d.getFullYear().toString()
                        : `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    domain={['auto', 'auto']}
                    width={64}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString('vi-VN') + ' đ', 'Giá']}
                    labelFormatter={(label: string) =>
                      `Ngày ${new Date(label).toLocaleDateString('vi-VN')}`
                    }
                  />
                  <ReferenceLine
                    y={stock.price}
                    stroke="#6b7280"
                    strokeDasharray="5 5"
                    label={{ value: 'Giá hiện tại', position: 'right', fontSize: 11, fill: '#6b7280' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPrice)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[400px] bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                <TrendingUp className="size-10 text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-400 dark:text-slate-500">Dữ liệu lịch sử giá đang được cập nhật</p>
                <p className="text-xs text-gray-300 dark:text-slate-600 mt-1">Giá hiện tại: {stock.price.toLocaleString('vi-VN')} đ</p>
              </div>
            )}
          </div>

          {/* Fundamentals and Valuation Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Fundamentals Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md border border-gray-200 dark:border-slate-700 dark:border-slate-700">
              <h2 className="font-semibold mb-6 flex items-center gap-2">
                <BarChart3 className="size-5 text-blue-600 dark:text-blue-400" />
                Chỉ số cơ bản
              </h2>

              {/* Margins */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">Biên lợi nhuận (Margins)</h3>
                <div className="space-y-3">
                  <MetricRow label="Gross Margin" value={fundamentalsData.margins.grossMargin > 0 ? `${fundamentalsData.margins.grossMargin.toFixed(1)}%` : 'N/A'} tooltip={metricTooltips.grossMargin} />
                  <MetricRow label="Operating Margin" value={fundamentalsData.margins.operatingMargin > 0 ? `${fundamentalsData.margins.operatingMargin.toFixed(1)}%` : 'N/A'} tooltip={metricTooltips.operatingMargin} />
                  <MetricRow label="Net Margin" value={fundamentalsData.margins.netMargin > 0 ? `${fundamentalsData.margins.netMargin.toFixed(1)}%` : 'N/A'} tooltip={metricTooltips.netMargin} />
                  <MetricRow label="EBITDA Margin" value={fundamentalsData.margins.ebitdaMargin > 0 ? `${fundamentalsData.margins.ebitdaMargin.toFixed(1)}%` : 'N/A'} tooltip={metricTooltips.ebitdaMargin} />
                </div>
              </div>

              {/* Efficiency */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">Hiệu quả hoạt động</h3>
                <div className="space-y-3">
                  <MetricRow label="ROA" value={fundamentalsData.efficiency.roa > 0 ? `${fundamentalsData.efficiency.roa.toFixed(1)}%` : 'N/A'} tooltip={metricTooltips.roa} />
                  <MetricRow label="ROE" value={fundamentalsData.efficiency.roe > 0 ? `${fundamentalsData.efficiency.roe.toFixed(1)}%` : 'N/A'} tooltip={metricTooltips.roe} />
                  <MetricRow label="ROIC" value={fundamentalsData.efficiency.roic > 0 ? `${fundamentalsData.efficiency.roic.toFixed(1)}%` : 'N/A'} tooltip={metricTooltips.roic} />
                  <MetricRow label="Asset Turnover" value={fundamentalsData.efficiency.assetTurnover > 0 ? `${fundamentalsData.efficiency.assetTurnover.toFixed(2)}x` : 'N/A'} tooltip={metricTooltips.assetTurnover} />
                </div>
              </div>

              {/* Leverage */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">Đòn bẩy tài chính (Leverage)</h3>
                <div className="space-y-3">
                  <MetricRow label="Debt/Equity (D/E)" value={stock.debtToEquity > 0 ? stock.debtToEquity.toFixed(2) : 'N/A'} tooltip={metricTooltips.debtToEquity} />
                  <MetricRow label="Debt/Assets" value={fundamentalsData.leverage.debtToAssets > 0 ? fundamentalsData.leverage.debtToAssets.toFixed(2) : 'N/A'} tooltip={metricTooltips.debtToAssets} />
                  <MetricRow label="Current Ratio" value={fundamentalsData.leverage.currentRatio > 0 ? fundamentalsData.leverage.currentRatio.toFixed(2) : 'N/A'} tooltip={metricTooltips.currentRatio} />
                  <MetricRow label="Quick Ratio" value={fundamentalsData.leverage.quickRatio > 0 ? fundamentalsData.leverage.quickRatio.toFixed(2) : 'N/A'} tooltip={metricTooltips.quickRatio} />
                </div>
              </div>
            </div>

            {/* Valuation Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md border border-gray-200 dark:border-slate-700 dark:border-slate-700">
              <h2 className="font-semibold mb-6 flex items-center gap-2">
                <DollarSign className="size-5 text-emerald-600 dark:text-emerald-400" />
                Định giá
              </h2>

              <div className="space-y-3">
                <MetricRow label="P/E (Price to Earnings)" value={valuationData.pe > 0 ? valuationData.pe.toFixed(1) : 'N/A'} tooltip={metricTooltips.pe} />
                <MetricRow label="Forward P/E" value={valuationData.forwardPE > 0 ? valuationData.forwardPE.toFixed(1) : 'N/A'} tooltip={metricTooltips.forwardPE} />
                <MetricRow label="P/S (Price to Sales)" value={valuationData.ps > 0 ? valuationData.ps.toFixed(1) : 'N/A'} tooltip={metricTooltips.ps} />
                <MetricRow label="P/B (Price to Book)" value={valuationData.pb > 0 ? valuationData.pb.toFixed(1) : 'N/A'} tooltip={metricTooltips.pb} />
                <MetricRow label="PEG Ratio" value={valuationData.peg > 0 ? valuationData.peg.toFixed(1) : 'N/A'} tooltip={metricTooltips.peg} />
                <MetricRow label="EV/EBITDA" value={valuationData.evToEbitda > 0 ? valuationData.evToEbitda.toFixed(1) : 'N/A'} tooltip={metricTooltips.evToEbitda} />
                <MetricRow label="EV/Sales" value={valuationData.evToSales > 0 ? valuationData.evToSales.toFixed(1) : 'N/A'} tooltip={metricTooltips.evToSales} />
                <MetricRow label="Price/FCF" value={valuationData.priceToFCF > 0 ? valuationData.priceToFCF.toFixed(1) : 'N/A'} tooltip={metricTooltips.priceToFCF} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dividend' && (
        <div className="space-y-6">
          {/* Dividend Info */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-slate-700 dark:border-slate-700">
            <h2 className="font-semibold mb-6 flex items-center gap-2">
              <DollarSign className="size-5 text-emerald-600 dark:text-emerald-400" />
              Thông tin cổ tức
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 mb-8">
              <div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mb-1">Tỷ suất cổ tức</p>
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  {stock.dividendYield > 0 ? `${stock.dividendYield.toFixed(1)}%` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mb-1">Cổ tức/CP</p>
                <p className="text-lg font-semibold">{stock.dividendPerShare > 0 ? formatVND(stock.dividendPerShare) : 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mb-1">Ngày GDKHQ gần nhất</p>
                <p className="text-lg font-semibold">{formatDate(stock.exDividendDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mb-1">Payout Ratio</p>
                <p className="text-lg font-semibold">{stock.payoutRatio > 0 ? `${stock.payoutRatio}%` : 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mb-1">Tăng trưởng 5Y</p>
                <p className={`text-lg font-semibold ${stock.dividendGrowth5Y > 0 ? 'text-emerald-600 dark:text-emerald-400' : stock.dividendGrowth5Y < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {stock.dividendGrowth5Y !== 0 ? formatPercent(stock.dividendGrowth5Y) : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mb-1">Chuỗi tăng trưởng</p>
                <p className="text-lg font-semibold">{stock.dividendStreak > 0 ? `${stock.dividendStreak} năm` : 'N/A'}</p>
              </div>
            </div>

            {/* Dividend History Chart */}
            {stock.dividendHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-4 text-gray-700 dark:text-slate-300">Lịch sử chi trả cổ tức</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stock.dividendHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => formatVND(value)} />
                    <Bar dataKey="amount" fill="#10b981" name="Cổ tức/CP" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Dividend History Table */}
            {stock.dividendHistory.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-3 text-gray-700 dark:text-slate-300">Chi tiết các đợt trả</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Năm</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Cổ tức/CP</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Yield</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Ngày GDKHQ</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Ngày chi trả</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                      {stock.dividendHistory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 dark:bg-slate-950">
                          <td className="px-4 py-2">{item.year}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatVND(item.amount)}</td>
                          <td className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400">{item.yield.toFixed(1)}%</td>
                          <td className="px-4 py-2">{formatDate(item.exDate)}</td>
                          <td className="px-4 py-2">{formatDate(item.payDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payout Ratio Chart */}
            {stock.dividendHistory.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium mb-4 text-gray-700 dark:text-slate-300">Tỷ lệ chi trả (Payout Ratio)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={stock.dividendHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="yield" stroke="#8b5cf6" strokeWidth={2} name="Yield %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'fundamentals' && (
        <div className="space-y-6">
          {/* Financial Health Dashboard Header */}
          <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="size-6 text-blue-600 dark:text-blue-400" />
              <h2 className="text-2xl font-bold text-slate-900">Phân tích sức khỏe tài chính</h2>
            </div>
            <p className="text-sm text-slate-600">
              Theo dõi các chỉ số quan trọng qua 10 năm để đánh giá sự ổn định và tiềm năng tăng trưởng
            </p>
          </div>

          {/* Financial Health Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* EPS Chart */}
            {epsChartData.length > 0 && (
              <FinancialChart
                title="Lợi nhuận trên cổ phiếu (EPS)"
                data={epsChartData}
                caption="EPS TTM tính từ cổ tức và payout ratio thực tế"
                formatter={(value) => formatVND(value)}
                unit="đ/CP"
                colorLogic={epsColorLogic}
              />
            )}

            {/* Payout Ratio Chart */}
            {payoutChartData.length > 0 && (
              <FinancialChart
                title="Tỷ lệ chi trả cổ tức (%)"
                data={payoutChartData}
                caption="Tỷ lệ thấp hơn 60% đảm bảo an toàn cho cổ tức"
                formatter={(value) => value.toFixed(1)}
                unit="%"
                thresholdLine={{ value: 60, label: 'Ngưỡng an toàn < 60%', color: '#64748b' }}
                colorLogic={payoutRatioColorLogic}
              />
            )}

            {/* Free Cash Flow Chart */}
            {fcfChartData.length > 0 && (
              <FinancialChart
                title="Dòng tiền tự do (FCF)"
                data={fcfChartData}
                caption="Chỉ số quan trọng nhất để đánh giá khả năng chi trả cổ tức"
                formatter={(value) => `${(value / 1_000_000_000).toFixed(1)}B`}
                unit="VNĐ"
                colorLogic={fcfColorLogic}
              />
            )}

            {/* Shares Outstanding Chart */}
            {sharesChartData.length > 0 && (
              <FinancialChart
                title="Số lượng cổ phiếu lưu hành"
                data={sharesChartData}
                caption="Tính từ vốn hóa ÷ giá hiện tại"
                formatter={(value) => `${value.toFixed(0)}M`}
                unit="triệu CP"
                colorLogic={sharesOutstandingColorLogic}
              />
            )}

            {/* Revenue Chart */}
            {revenueChartData.length > 0 && (
              <FinancialChart
                title="Doanh thu TTM (Revenue)"
                data={revenueChartData}
                caption="Doanh thu 12 tháng gần nhất từ Supabase"
                formatter={(value) => `${(value / 1_000_000_000).toFixed(1)}B`}
                unit="VNĐ"
                colorLogic={revenueColorLogic}
              />
            )}

            {/* Net Income Chart */}
            {netIncomeChartData.length > 0 && (
              <FinancialChart
                title="Lợi nhuận ròng TTM (Net Income)"
                data={netIncomeChartData}
                caption="Khả năng sinh lời sau khi trừ mọi chi phí"
                formatter={(value) => `${(value / 1_000_000_000).toFixed(1)}B`}
                unit="VNĐ"
                colorLogic={netIncomeColorLogic}
              />
            )}

            {/* Fallback when no financial data is available */}
            {epsChartData.length === 0 && payoutChartData.length === 0 &&
             fcfChartData.length === 0 && revenueChartData.length === 0 && (
              <div className="col-span-3 flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                <Activity className="size-8 text-gray-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">
                  Dữ liệu tài chính đang được cập nhật
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  Pipeline sẽ cập nhật dữ liệu tự động
                </p>
              </div>
            )}
          </div>

          {/* Key Metrics Summary */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
              <BarChart3 className="size-5 text-blue-600 dark:text-blue-400" />
              Tóm tắt chỉ số tài chính hiện tại
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-slate-600 mb-1">Revenue YoY</p>
                <p className={`text-lg font-semibold ${stock.revenueYoY > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatPercent(stock.revenueYoY)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Net Income YoY</p>
                <p className={`text-lg font-semibold ${stock.netIncomeYoY > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatPercent(stock.netIncomeYoY)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">FCF YoY</p>
                <p className={`text-lg font-semibold ${stock.fcfYoY > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatPercent(stock.fcfYoY)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Debt/Equity</p>
                <p className="text-lg font-semibold text-slate-900">{stock.debtToEquity.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* AI Sidebar */}
      <StockAISidebar
        isOpen={isAISidebarOpen}
        onClose={() => setIsAISidebarOpen(false)}
        stockData={{
          ticker: stock.ticker,
          name: stock.name,
          price: stock.price,
          sector: stock.sector,
          marketCap: stock.marketCap,
          dividendYield: stock.dividendYield,
          payoutRatio: stock.payoutRatio,
          pe: valuationData.pe,
          pb: valuationData.pb,
          roe: fundamentalsData.efficiency.roe,
          roa: fundamentalsData.efficiency.roa,
          debtToEquity: stock.debtToEquity,
          revenueYoY: revenueTTM,
          netIncomeYoY: netIncomeTTM,
          fcfYoY: fcfTTM
        }}
      />
    </div>
  );
}

// Metric Row Component with Tooltip
function MetricRow({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700/50 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700 dark:text-slate-300">{label}</span>
        <div className="relative">
          <Info
            className="size-3.5 text-gray-400 dark:text-slate-500 cursor-help"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          />
          {showTooltip && (
            <div className="absolute left-0 top-5 z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
              {tooltip}
            </div>
          )}
        </div>
      </div>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}