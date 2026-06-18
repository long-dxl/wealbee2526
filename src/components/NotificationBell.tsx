import { useState, useEffect, useMemo } from 'react';
import {
  Bell, X, AlertTriangle, Info, TrendingDown, Sparkles,
  TrendingUp, Coins, Landmark, Globe, CheckCheck, Filter,
  ChevronRight, ShieldAlert, BellRing, CircleDot, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { type Notification, type NotificationSeverity, type NotificationType } from '../lib/notifications';
import { supabase } from '../lib/supabase/client';

const VALID_TYPES: NotificationType[] = [
  'DIVIDEND_SAFETY_DROP', 'EARNINGS_MISS', 'MACRO_RATE', 'EXCHANGE_RATE',
  'MARKET_FLOW', 'INDEX_REBALANCING', 'EX_DIVIDEND_ALERT', 'GOLD_ALERT',
  'CRYPTO_ALERT', 'BOND_ALERT',
];

function mapDbRow(row: Record<string, any>): Notification {
  const meta = (row.metadata as Record<string, any>) || {};
  const type: NotificationType = VALID_TYPES.includes(row.notification_type)
    ? row.notification_type
    : 'MACRO_RATE';
  const severity: NotificationSeverity = ['critical', 'warning', 'info'].includes(meta.severity)
    ? meta.severity
    : 'info';
  return {
    id: row.id,
    type,
    assetClass: meta.assetClass ?? 'macro',
    severity,
    title: row.title,
    impact: row.message,
    summary: meta.summary ?? row.message,
    ticker: meta.ticker,
    aiPrompt: meta.aiPrompt ?? `${row.title}: ${row.message}`,
    timestamp: new Date(row.created_at || Date.now()),
    read: row.is_read ?? false,
  };
}

// ── Severity config ───────────────────────────────────────────────────────────
const severityConfig: Record<NotificationSeverity, {
  border: string; dotBg: string; badgeBg: string; badgeText: string; label: string;
  iconBg: string; ringColor: string;
}> = {
  critical: {
    border: 'border-l-red-500',
    dotBg: 'bg-red-500',
    badgeBg: 'bg-red-50 dark:bg-red-950/40',
    badgeText: 'text-red-600 dark:text-red-400',
    label: 'Khẩn cấp',
    iconBg: 'bg-red-100 dark:bg-red-900/40',
    ringColor: 'ring-red-200 dark:ring-red-800/40',
  },
  warning: {
    border: 'border-l-amber-500',
    dotBg: 'bg-amber-500',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
    badgeText: 'text-amber-600 dark:text-amber-400',
    label: 'Cảnh báo',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    ringColor: 'ring-amber-200 dark:ring-amber-800/40',
  },
  info: {
    border: 'border-l-blue-500',
    dotBg: 'bg-blue-400',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40',
    badgeText: 'text-blue-600 dark:text-blue-400',
    label: 'Thông tin',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    ringColor: 'ring-blue-200 dark:ring-blue-800/40',
  },
};

// ── Asset class config ────────────────────────────────────────────────────────
const assetConfig: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  stock:  { label: 'Cổ phiếu', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', icon: TrendingUp },
  gold:   { label: 'Vàng',     bg: 'bg-yellow-50 dark:bg-yellow-950/40',   text: 'text-yellow-700 dark:text-yellow-400', icon: Coins },
  crypto: { label: 'Crypto',   bg: 'bg-purple-50 dark:bg-purple-950/40',   text: 'text-purple-700 dark:text-purple-400', icon: CircleDot },
  bond:   { label: 'Trái phiếu', bg: 'bg-sky-50 dark:bg-sky-950/40',       text: 'text-sky-700 dark:text-sky-400', icon: Landmark },
  macro:  { label: 'Vĩ mô',    bg: 'bg-slate-50 dark:bg-slate-800',        text: 'text-slate-600 dark:text-slate-300', icon: Globe },
};

// ── Type → Icon mapping ───────────────────────────────────────────────────────
function NotifIcon({ type, severity, className }: {
  type: NotificationType;
  severity: NotificationSeverity;
  className?: string;
}) {
  if (type === 'DIVIDEND_SAFETY_DROP' || type === 'EARNINGS_MISS') return <TrendingDown className={className} />;
  if (type === 'MACRO_RATE' || type === 'EXCHANGE_RATE') return <Globe className={className} />;
  if (type === 'GOLD_ALERT') return <Coins className={className} />;
  if (type === 'CRYPTO_ALERT') return <TrendingUp className={className} />;
  if (type === 'BOND_ALERT') return <Landmark className={className} />;
  if (type === 'INDEX_REBALANCING') return <AlertTriangle className={className} />;
  if (type === 'EX_DIVIDEND_ALERT') return <Bell className={className} />;
  if (severity === 'critical' || severity === 'warning') return <AlertTriangle className={className} />;
  return <Info className={className} />;
}

const severityIconColor: Record<NotificationSeverity, string> = {
  critical: 'text-red-500',
  warning:  'text-amber-500',
  info:     'text-blue-500',
};

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

type FilterTab = 'all' | 'critical' | 'warning' | 'info';

// ── Main component ────────────────────────────────────────────────────────────
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;
  const criticalCount = notifications.filter(n => n.severity === 'critical' && !n.read).length;

  // Fetch real notifications from Supabase
  useEffect(() => {
    let cancelled = false;
    async function fetchNotifs() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!cancelled && !error && data) {
          setNotifications(data.map(mapDbRow));
        }
      } catch {
        // silently — no notifications on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchNotifs();
    return () => { cancelled = true; };
  }, []);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    supabase.rpc('mark_notification_read', { p_notification_id: id }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      supabase.rpc('mark_all_notifications_read', { p_user_id: user.id }).catch(() => {});
    }
  };

  const handleAskBeeAI = (notification: Notification) => {
    markRead(notification.id);
    setIsOpen(false);
    navigate(`/app/pi-ai?prompt=${encodeURIComponent(notification.aiPrompt)}`);
  };

  // Sort: unread → severity (critical > warning > info) → newest
  const severityOrder: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = useMemo(() => {
    const filtered = activeFilter === 'all'
      ? notifications
      : notifications.filter(n => n.severity === activeFilter);

    return [...filtered].sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      if (a.severity !== b.severity) return severityOrder[a.severity] - severityOrder[b.severity];
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }, [notifications, activeFilter]);

  const filterTabs: { key: FilterTab; label: string; icon: any; count: number }[] = [
    { key: 'all', label: 'Tất cả', icon: BellRing, count: notifications.filter(n => !n.read).length },
    { key: 'critical', label: 'Khẩn cấp', icon: ShieldAlert, count: notifications.filter(n => n.severity === 'critical' && !n.read).length },
    { key: 'warning', label: 'Cảnh báo', icon: AlertTriangle, count: notifications.filter(n => n.severity === 'warning' && !n.read).length },
    { key: 'info', label: 'Thông tin', icon: Info, count: notifications.filter(n => n.severity === 'info' && !n.read).length },
  ];

  return (
    <>
      {/* ── Bell button ── */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 rounded-lg transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="Thông báo"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Overlay ── */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* ── Sidebar Panel ── */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[460px] bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ─── Header ─── */}
        <div className="bg-gradient-to-r from-[#4980DF] to-[#3b6bc4] px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base">Cảnh báo thị trường</h2>
                <p className="text-blue-100 text-xs mt-0.5">
                  {unreadCount > 0 ? `${unreadCount} cảnh báo chưa đọc` : 'Tất cả đã đọc'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-lg transition-colors backdrop-blur-sm"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Đã đọc hết</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/15 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* ─── Critical alert banner ─── */}
          {criticalCount > 0 && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-400/30 rounded-lg backdrop-blur-sm">
              <ShieldAlert className="w-4 h-4 text-red-200 flex-shrink-0" />
              <p className="text-xs text-red-100 font-medium">
                {criticalCount} cảnh báo khẩn cấp cần xem ngay
              </p>
            </div>
          )}
        </div>

        {/* ─── Filter Tabs ─── */}
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 flex-shrink-0 overflow-x-auto">
          {filterTabs.map(tab => {
            const isActive = activeFilter === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#4980DF]/10 text-[#4980DF] dark:bg-[#4980DF]/20 dark:text-[#7aa8ef] shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                    isActive
                      ? 'bg-[#4980DF] text-white'
                      : tab.key === 'critical' ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ─── Notification List ─── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full py-16 px-6">
              <Loader2 className="w-8 h-8 text-[#4980DF] animate-spin mb-3" />
              <p className="text-xs text-gray-400 dark:text-slate-500">Đang tải cảnh báo...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 px-6">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Filter className="w-8 h-8 text-gray-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
                Không có cảnh báo nào
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                {activeFilter === 'all' ? 'Chưa có cảnh báo mới' : 'Thử chọn bộ lọc khác'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-800/80">
              {sorted.map(n => {
                const sev = severityConfig[n.severity];
                const asset = assetConfig[n.assetClass] ?? assetConfig.macro;
                const AssetIcon = asset.icon;
                const isExpanded = expandedId === n.id;

                return (
                  <div
                    key={n.id}
                    className={`relative transition-all duration-200 ${
                      n.read
                        ? 'bg-white dark:bg-slate-900'
                        : 'bg-slate-50/80 dark:bg-slate-800/30'
                    }`}
                  >
                    {/* Severity indicator bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                      n.severity === 'critical' ? 'bg-red-500' :
                      n.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400'
                    }`} />

                    {/* Main content area */}
                    <div
                      className="pl-4 pr-4 py-3.5 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-slate-800/50 transition-colors"
                      onClick={() => {
                        markRead(n.id);
                        setExpandedId(isExpanded ? null : n.id);
                      }}
                    >
                      {/* Top row: icon + tags + time */}
                      <div className="flex items-center gap-2 mb-2">
                        {/* Severity icon */}
                        <div className={`w-7 h-7 rounded-lg ${sev.iconBg} flex items-center justify-center flex-shrink-0 ring-1 ${sev.ringColor}`}>
                          <NotifIcon
                            type={n.type}
                            severity={n.severity}
                            className={`w-3.5 h-3.5 ${severityIconColor[n.severity]}`}
                          />
                        </div>

                        {/* Tags */}
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sev.badgeBg} ${sev.badgeText}`}>
                            {sev.label}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${asset.bg} ${asset.text}`}>
                            <AssetIcon className="w-2.5 h-2.5" />
                            {asset.label}
                          </span>
                          {n.ticker && (
                            <span className="text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-md font-mono">
                              {n.ticker}
                            </span>
                          )}
                        </div>

                        {/* Time + unread dot */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 whitespace-nowrap">
                            {timeAgo(n.timestamp)}
                          </span>
                          {!n.read && (
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sev.dotBg} ring-2 ring-white dark:ring-slate-900`} />
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <p className={`text-[13px] font-semibold leading-snug mb-1.5 pr-4 ${
                        n.read ? 'text-gray-700 dark:text-slate-300' : 'text-gray-900 dark:text-white'
                      }`}>
                        {n.title}
                      </p>

                      {/* Impact (always visible) */}
                      <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
                        {n.impact}
                      </p>

                      {/* Expand indicator */}
                      <div className="flex items-center gap-1 mt-2">
                        <ChevronRight className={`w-3 h-3 text-gray-400 dark:text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                        <span className="text-[10px] text-gray-400 dark:text-slate-500">
                          {isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                        </span>
                      </div>
                    </div>

                    {/* Expanded details */}
                    <div className={`overflow-hidden transition-all duration-300 ease-out ${
                      isExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
                    }`}>
                      <div className="pl-4 pr-4 pb-4 pt-0">
                        {/* Detailed summary */}
                        <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-3.5 mb-3 border border-gray-100 dark:border-slate-700/50">
                          <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                            {n.summary}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={e => { e.stopPropagation(); handleAskBeeAI(n); }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shadow-emerald-500/20 hover:shadow-emerald-500/30"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Phân tích với Bee AI
                          </button>
                          {n.ticker && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                markRead(n.id);
                                setIsOpen(false);
                                navigate(`/app/stock/${n.ticker}`);
                              }}
                              className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 text-xs font-medium rounded-xl transition-colors border border-gray-200 dark:border-slate-700"
                            >
                              Xem {n.ticker}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                Cập nhật thời gian thực · AI tích hợp Q2 2026
              </p>
            </div>
            <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">
              {sorted.length}/{notifications.length} cảnh báo
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
