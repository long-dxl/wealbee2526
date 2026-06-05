import { useState } from 'react';
import { X, Plus, Check, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../lib/auth-context';

interface Holding {
  symbol: string;
  quantity: number;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_SYMBOLS = 10;

export function NewsletterSetupModal({ onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = () => {
    const sym = newSymbol.trim().toUpperCase();
    const qty = parseInt(newQuantity);
    if (!sym || isNaN(qty) || qty <= 0) return;
    if (holdings.length >= MAX_SYMBOLS) return;
    setHoldings(prev => [...prev, { symbol: sym, quantity: qty }]);
    setNewSymbol('');
    setNewQuantity('');
    setShowAddForm(false);
  };

  const handleDelete = (i: number) => {
    setHoldings(prev => prev.filter((_, idx) => idx !== i));
    if (editingIndex === i) setEditingIndex(null);
  };

  const handleStartEdit = (i: number) => {
    setEditingIndex(i);
    setEditSymbol(holdings[i].symbol);
    setEditQuantity(String(holdings[i].quantity));
    setShowAddForm(false);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    const sym = editSymbol.trim().toUpperCase();
    const qty = parseInt(editQuantity);
    if (!sym || isNaN(qty) || qty <= 0) return;
    setHoldings(prev => prev.map((h, i) => i === editingIndex ? { symbol: sym, quantity: qty } : h));
    setEditingIndex(null);
  };

  const handleSave = async () => {
    if (holdings.length === 0) { setError('Vui lòng thêm ít nhất 1 mã cổ phiếu'); return; }
    if (!user) { setError('Chưa đăng nhập'); return; }
    setLoading(true);
    setError('');
    try {
      const watchSymbols = Array.isArray(holdings)
        ? holdings.map((h: any) => typeof h === 'string' ? h : h?.symbol).filter(Boolean)
        : [];
      const { error: err } = await supabase
        .from('digest_subscribers')
        .upsert(
          { email: user.email, user_id: user.id, watch_symbols: watchSymbols },
          { onConflict: 'email' }
        );
      if (err) throw err;
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h2 className="text-[18px] font-bold text-gray-900 dark:text-white">Thiết lập nhận bản tin</h2>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5">Thêm các mã cổ phiếu bạn muốn theo dõi</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="size-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Holdings list */}
          {holdings.length > 0 && (
            <div className="border border-gray-200 dark:border-slate-600 rounded-xl mb-4 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_90px_40px_40px] gap-x-2 px-4 py-2 bg-gray-50 dark:bg-slate-700/50">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Mã CP</span>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Số lượng</span>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 text-center">Sửa</span>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 text-center">Xoá</span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {holdings.map((h, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_40px_40px] gap-x-2 items-center px-4 py-2.5">
                    {editingIndex === i ? (
                      <>
                        <input
                          autoFocus
                          value={editSymbol}
                          onChange={e => setEditSymbol(e.target.value.toUpperCase())}
                          className="border border-[#0849ac] rounded-md px-2 py-1 text-[13px] font-semibold text-gray-900 dark:text-white dark:bg-slate-700 focus:outline-none w-full"
                          maxLength={10}
                          onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                        />
                        <input
                          value={editQuantity}
                          onChange={e => setEditQuantity(e.target.value)}
                          type="number" min={1}
                          className="border border-[#0849ac] rounded-md px-2 py-1 text-[13px] text-gray-900 dark:text-white dark:bg-slate-700 focus:outline-none w-full"
                          onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                        />
                        <button onClick={handleSaveEdit} className="flex items-center justify-center hover:opacity-70">
                          <Check className="size-4 text-[#0849ac]" />
                        </button>
                        <button onClick={() => setEditingIndex(null)} className="flex items-center justify-center hover:opacity-70">
                          <X className="size-4 text-gray-400" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[14px] font-semibold text-gray-900 dark:text-white">{h.symbol}</span>
                        <span className="text-[14px] text-gray-600 dark:text-slate-300">{h.quantity.toLocaleString()}</span>
                        <button onClick={() => handleStartEdit(i)} className="flex items-center justify-center hover:opacity-60">
                          <Pencil className="size-3.5 text-gray-400" />
                        </button>
                        <button onClick={() => handleDelete(i)} className="flex items-center justify-center hover:opacity-60">
                          <X className="size-4 text-gray-400" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Add row inline */}
              {showAddForm && holdings.length < MAX_SYMBOLS && (
                <div className="grid grid-cols-[1fr_90px_40px_40px] gap-x-2 items-center px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 bg-blue-50/50 dark:bg-slate-700/30">
                  <input
                    autoFocus
                    value={newSymbol}
                    onChange={e => setNewSymbol(e.target.value.toUpperCase())}
                    placeholder="VD: VIC"
                    maxLength={10}
                    className="border border-[#0849ac] rounded-md px-2 py-1 text-[13px] font-semibold text-gray-900 dark:text-white dark:bg-slate-700 focus:outline-none w-full placeholder-gray-300"
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  />
                  <input
                    value={newQuantity}
                    onChange={e => setNewQuantity(e.target.value)}
                    type="number" min={1}
                    placeholder="SL"
                    className="border border-[#0849ac] rounded-md px-2 py-1 text-[13px] text-gray-900 dark:text-white dark:bg-slate-700 focus:outline-none w-full placeholder-gray-300"
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  />
                  <button onClick={handleAdd} className="flex items-center justify-center hover:opacity-70">
                    <Check className="size-4 text-[#0849ac]" />
                  </button>
                  <button onClick={() => { setShowAddForm(false); setNewSymbol(''); setNewQuantity(''); }} className="flex items-center justify-center hover:opacity-70">
                    <X className="size-4 text-gray-400" />
                  </button>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-700/20">
                <button
                  onClick={() => { setShowAddForm(true); setEditingIndex(null); }}
                  disabled={holdings.length >= MAX_SYMBOLS || showAddForm}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0849ac] hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="size-3.5" />
                  Thêm mã
                </button>
                <span className="text-[12px] text-gray-400">
                  <span className="font-semibold text-gray-600 dark:text-slate-300">{holdings.length}</span> / {MAX_SYMBOLS} mã
                </span>
              </div>
            </div>
          )}

          {/* Empty state — show add form directly */}
          {holdings.length === 0 && !showAddForm && (
            <div
              onClick={() => setShowAddForm(true)}
              className="border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-[#0849ac] hover:bg-blue-50/30 transition-colors mb-4"
            >
              <Plus className="size-8 text-gray-300 mx-auto mb-2" />
              <p className="text-[14px] font-semibold text-gray-500 dark:text-slate-400">Nhấn để thêm mã cổ phiếu</p>
              <p className="text-[12px] text-gray-400 mt-1">VD: VNM, FPT, VCB...</p>
            </div>
          )}

          {/* Add form when empty */}
          {holdings.length === 0 && showAddForm && (
            <div className="border border-[#0849ac] rounded-xl p-4 mb-4 bg-blue-50/30 dark:bg-slate-700/30">
              <p className="text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-3">Thêm mã cổ phiếu</p>
              <div className="flex gap-2 mb-3">
                <input
                  autoFocus
                  value={newSymbol}
                  onChange={e => setNewSymbol(e.target.value.toUpperCase())}
                  placeholder="Mã CP (VD: VNM)"
                  maxLength={10}
                  className="flex-1 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-[14px] font-semibold text-gray-900 dark:text-white dark:bg-slate-700 focus:outline-none focus:border-[#0849ac]"
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <input
                  value={newQuantity}
                  onChange={e => setNewQuantity(e.target.value)}
                  type="number" min={1}
                  placeholder="Số lượng"
                  className="w-28 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-[14px] text-gray-900 dark:text-white dark:bg-slate-700 focus:outline-none focus:border-[#0849ac]"
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  className="flex-1 bg-[#0849ac] text-white py-2 rounded-lg text-[14px] font-semibold hover:bg-[#063d8f] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check className="size-4" /> Thêm
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setNewSymbol(''); setNewQuantity(''); }}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-[14px] text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Huỷ
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-[13px] text-red-500 mb-3">{error}</p>
          )}

          {/* Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3 mb-5">
            <p className="text-[12px] text-[#0849ac] dark:text-blue-300 leading-relaxed">
              Wealbee sẽ gửi email tổng hợp tin tức ảnh hưởng đến các mã này vào mỗi sáng trước khi thị trường mở cửa.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 dark:border-slate-600 rounded-xl text-[14px] font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Để sau
            </button>
            <button
              onClick={handleSave}
              disabled={loading || holdings.length === 0}
              className="flex-1 py-3 bg-gradient-to-r from-[#0849ac] to-[#2563eb] text-white rounded-xl text-[14px] font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang lưu...</>
              ) : (
                <><Check className="size-4" /> Lưu và bắt đầu nhận tin</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
