import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { ChevronDown, ChevronRight, ExternalLink, Newspaper, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../lib/auth-context';

const db = supabase as any;

interface NewsItem {
  id: string;
  title: string;
  content: string | null;
  article_url: string;
  label: string;
  source: string;
  published_at: string;
  news_type: string | null;
  affected_symbols: string[] | null;
  impact_reasoning: string | null;
  impact_score: number | null;
}

interface SymbolNews {
  symbol: string;
  quantity: number;
  news: NewsItem[];
}

// Module-level cache — survives tab switches
const cache: { data: SymbolNews[]; days: number; updatedAt: Date | null } = {
  data: [],
  days: 7,
  updatedAt: null,
};

const LABEL_VI: Record<string, string> = {
  very_positive: 'RẤT TÍCH CỰC',
  positive: 'TÍCH CỰC',
  negative: 'TIÊU CỰC',
  very_negative: 'RẤT TIÊU CỰC',
};

const LABEL_STYLES: Record<string, { badge: string; border: string; bg: string }> = {
  very_positive: { badge: 'bg-green-100 text-green-800', border: 'border-l-green-700', bg: 'bg-green-50' },
  positive:      { badge: 'bg-green-50 text-green-700',  border: 'border-l-green-500', bg: 'bg-green-50/50' },
  negative:      { badge: 'bg-red-50 text-red-700',      border: 'border-l-red-500',   bg: 'bg-red-50/50' },
  very_negative: { badge: 'bg-red-100 text-red-800',     border: 'border-l-red-700',   bg: 'bg-red-50' },
};

const NEWS_TYPE_VI: Record<string, string> = {
  vi_mo:        'Vĩ mô',
  vi_mo_dn:     'Vĩ mô ngành',
  hoat_dong_kd: 'Hoạt động KD',
  phap_ly:      'Pháp lý',
  thi_truong:   'Thị trường',
  du_bao:       'Dự báo',
};

const EMAIL_LABELS = ['very_positive', 'positive', 'negative', 'very_negative'];

const DAY_OPTIONS = [
  { label: 'Hôm qua', value: 1 },
  { label: '3 ngày', value: 3 },
  { label: '7 ngày', value: 7 },
  { label: '15 ngày', value: 15 },
];

async function fetchNewsForSymbol(symbol: string, days: number): Promise<NewsItem[]> {
  const seen = new Set<string>();
  const results: NewsItem[] = [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const fields = 'id,title,content,article_url,label,source,published_at,news_type,affected_symbols,impact_reasoning,impact_score';

  const r1 = await db.from('market_news')
    .select(fields)
    .eq('symbol', symbol)
    .in('label', EMAIL_LABELS)
    .gte('labeled_at', since)
    .order('published_at', { ascending: false })
    .limit(50);

  for (const row of r1.data || []) {
    seen.add(row.id);
    results.push(row);
  }

  const r2 = await db.from('market_news')
    .select(fields)
    .contains('affected_symbols', [symbol])
    .in('label', EMAIL_LABELS)
    .gte('labeled_at', since)
    .order('published_at', { ascending: false })
    .limit(50);

  for (const row of r2.data || []) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      results.push(row);
    }
  }

  results.sort((a, b) => Math.abs(b.impact_score || 0) - Math.abs(a.impact_score || 0));
  return results;
}

function NewsCard({ news, symbol }: { news: NewsItem; symbol: string }) {
  const label = news.label || 'positive';
  const styles = LABEL_STYLES[label] || LABEL_STYLES.positive;
  const badgeText = LABEL_VI[label] || label.toUpperCase();
  const typeTag = news.news_type ? NEWS_TYPE_VI[news.news_type] || news.news_type : null;
  const content = news.content ? news.content.slice(0, 280).trim() + '...' : null;

  const deepPrompt = encodeURIComponent(
    `Tóm tắt bài báo: ${news.article_url}\n` +
    `Phân tích tác động của tin này lên cổ phiếu ${symbol}.\n` +
    `Bạn hãy research các thông tin cần thiết liên quan để tự cung cấp đủ context nhằm phân tích tin tức và cho tôi biết:\n` +
    `- Tin ảnh hưởng trực tiếp hay gián tiếp?\n` +
    `- Mức độ tác động (mạnh / vừa / yếu)\n` +
    `- Ngắn hạn vs dài hạn\n` +
    `- Thị trường đã phản ánh chưa?\n` +
    `- Kết luận: bullish hay bearish (kèm reasoning)`
  );
  const chatgptUrl = `https://chatgpt.com/?q=${deepPrompt}`;

  return (
    <div className={`rounded-xl border-l-4 ${styles.border} ${styles.bg} dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 p-4`}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${styles.badge}`}>{badgeText}</span>
        {typeTag && (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{typeTag}</span>
        )}
        {news.source && (
          <span className="text-[11px] text-gray-400 dark:text-slate-500">{news.source}</span>
        )}
        <span className="text-[11px] text-gray-400 dark:text-slate-500 ml-auto">
          {new Date(news.published_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <a
        href={news.article_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[14px] font-semibold text-gray-900 dark:text-white hover:text-[#0849ac] dark:hover:text-blue-400 leading-snug block mb-2 transition-colors"
      >
        {news.title}
      </a>

      {content && (
        <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed mb-3">{content}</p>
      )}

      {news.impact_reasoning && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2.5 mb-3">
          <p className="text-[11px] font-bold text-[#0849ac] dark:text-blue-400 uppercase tracking-wide mb-1">AI Reasoning</p>
          <p className="text-[12px] text-gray-600 dark:text-slate-300 leading-relaxed">{news.impact_reasoning}</p>
        </div>
      )}

      <a
        href={chatgptUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 bg-black text-white text-[11px] font-semibold px-3.5 py-1.5 rounded-full hover:opacity-80 transition-opacity"
      >
        <img src="https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg" width={12} height={12} alt="" />
        Research sâu hơn
      </a>
    </div>
  );
}

function SymbolSection({ item, defaultOpen, days }: { item: SymbolNews; defaultOpen: boolean; days: number }) {
  const [open, setOpen] = useState(defaultOpen);
  const positiveCount = item.news.filter(n => n.label.includes('positive')).length;
  const negativeCount = item.news.filter(n => n.label.includes('negative')).length;
  const dayLabel = DAY_OPTIONS.find(o => o.value === days)?.label || `${days} ngày`;

  return (
    <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
      >
        <span className="text-gray-400 dark:text-slate-500">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
        <span className="text-[15px] font-bold text-gray-900 dark:text-white">{item.symbol}</span>
        <span className="text-[12px] text-gray-400 dark:text-slate-500">{item.quantity.toLocaleString()} cp</span>

        <div className="flex items-center gap-1.5 ml-1">
          {positiveCount > 0 && (
            <span className="text-[11px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
              +{positiveCount}
            </span>
          )}
          {negativeCount > 0 && (
            <span className="text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full">
              -{negativeCount}
            </span>
          )}
          {item.news.length === 0 && (
            <span className="text-[11px] text-gray-400 dark:text-slate-500">Không có tin mới</span>
          )}
        </div>

        <Link
          to={`/app/stock/${item.symbol}`}
          onClick={e => e.stopPropagation()}
          className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-[#0849ac] dark:text-blue-400 hover:opacity-70 transition-opacity shrink-0"
        >
          <ExternalLink className="size-3.5" />
          Xem chi tiết
        </Link>
      </button>

      {open && item.news.length > 0 && (
        <div className="bg-gray-50/50 dark:bg-slate-900/30 px-4 py-3 space-y-3">
          {item.news.map(n => (
            <NewsCard key={n.id} news={n} symbol={item.symbol} />
          ))}
        </div>
      )}

      {open && item.news.length === 0 && (
        <div className="px-4 py-6 text-center text-[13px] text-gray-400 dark:text-slate-500 bg-gray-50/50 dark:bg-slate-900/30">
          Không có tin tức đáng chú ý trong {dayLabel.toLowerCase()}
        </div>
      )}
    </div>
  );
}

export function PortfolioNews() {
  const { user } = useAuth();
  const [data, setData] = useState<SymbolNews[]>(cache.data);
  const [loading, setLoading] = useState(cache.data.length === 0);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cache.updatedAt);
  const [days, setDays] = useState(cache.days);
  const loadedDaysRef = useRef<number | null>(cache.data.length > 0 ? cache.days : null);

  const load = async (d: number, force = false) => {
    if (!user) return;
    if (!force && loadedDaysRef.current === d && cache.data.length > 0) return;
    setLoading(true);
    setError('');
    try {
      const { data: sub } = await db.from('digest_subscribers')
        .select('watch_symbols')
        .eq('email', user.email)
        .maybeSingle();

      const holdings: { symbol: string; quantity: number }[] = (sub?.watch_symbols || []).map((s: string) => ({ symbol: s, quantity: 0 }));

      if (holdings.length === 0) {
        cache.data = [];
        cache.days = d;
        cache.updatedAt = new Date();
        setData([]);
        setLoading(false);
        return;
      }

      const results = await Promise.all(
        holdings.map(async (h) => ({
          symbol: h.symbol,
          quantity: h.quantity,
          news: await fetchNewsForSymbol(h.symbol, d),
        }))
      );

      results.sort((a, b) => {
        const scoreA = a.news.reduce((s, n) => s + Math.abs(n.impact_score || 0), 0);
        const scoreB = b.news.reduce((s, n) => s + Math.abs(n.impact_score || 0), 0);
        return scoreB - scoreA;
      });

      cache.data = results;
      cache.days = d;
      cache.updatedAt = new Date();
      loadedDaysRef.current = d;

      setData(results);
      setLastUpdated(cache.updatedAt);
    } catch (e: any) {
      setError(e.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(days); }, [user]);

  const handleDaysChange = (d: number) => {
    setDays(d);
    load(d);
  };

  const totalNews = data.reduce((s, d) => s + d.news.length, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0849ac]/10 dark:bg-[#0849ac]/20 flex items-center justify-center shrink-0">
            <Newspaper className="size-5 text-[#0849ac] dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-gray-900 dark:text-white">Bản Tin Danh Mục</h1>
            <p className="text-[12px] text-gray-400 dark:text-slate-500">
              Tin tức ảnh hưởng đến các mã bạn theo dõi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Day filter */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
            {DAY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleDaysChange(opt.value)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all disabled:opacity-50 ${
                  days === opt.value
                    ? 'bg-white dark:bg-slate-700 text-[#0849ac] dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {lastUpdated && (
            <span className="text-[11px] text-gray-400 dark:text-slate-500 hidden sm:block">
              {lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => load(days, true)}
            disabled={loading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-gray-500 dark:text-slate-400 disabled:opacity-40"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="size-8 text-[#0849ac] animate-spin" />
          <p className="text-[13px] text-gray-400 dark:text-slate-500">Đang tải tin tức...</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && data.length === 0 && (
        <div className="text-center py-16">
          <Newspaper className="size-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-gray-500 dark:text-slate-400 mb-1">Chưa có danh mục theo dõi</p>
          <p className="text-[13px] text-gray-400 dark:text-slate-500">
            Thiết lập danh mục bản tin từ trang{' '}
            <Link to="/app" className="text-[#0849ac] dark:text-blue-400 hover:underline">Danh Mục</Link>
          </p>
        </div>
      )}

      {/* Stats */}
      {!loading && !error && data.length > 0 && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <span className="text-[13px] text-gray-500 dark:text-slate-400">
            <span className="font-semibold text-gray-900 dark:text-white">{data.length}</span> mã ·{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{totalNews}</span> tin tức
          </span>
        </div>
      )}

      {/* Symbol sections */}
      {!loading && !error && data.length > 0 && (
        <div className="space-y-3">
          {data.map((item, i) => (
            <SymbolSection key={item.symbol} item={item} defaultOpen={i === 0} days={days} />
          ))}
        </div>
      )}
    </div>
  );
}
