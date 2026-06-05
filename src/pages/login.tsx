/**
 * Login Page - Authentication Interface
 * Light mode: clean white card | Dark mode: dark gradient
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { motion } from 'motion/react';
import {
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase/client';
import { ThemeToggle } from '../components/theme-toggle';
import wealbeeLogoUrl from '../assets/BRAND_NAME-logo-color.svg';

export function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const { login, register, loginWithGoogle, loginWithFacebook, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/app';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        await login(email, password);
        // Liên kết user_id vào subscribers nếu chưa có (account cũ subscribe qua /start)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('digest_subscribers')
            .update({ user_id: user.id })
            .eq('email', email)
            .is('user_id', null);
        }
      } else {
        if (!name.trim()) { setError('Vui lòng nhập họ tên'); return; }
        await register(email, password, name);
        // Lấy user vừa tạo để có uid, upsert subscribers với user_id
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('digest_subscribers').upsert(
            { email, watch_symbols: [], user_id: user.id },
            { onConflict: 'email' }
          );
        }
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      if (err.message?.includes('Invalid login credentials')) setError('Email hoặc mật khẩu không đúng');
      else if (err.message?.includes('User already registered')) setError('Email này đã được đăng ký');
      else if (err.message?.includes('Email not confirmed')) setError('Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.');
      else if (err.message?.includes('kiểm tra email')) setError(err.message);
      else if (err.message?.includes('signup_disabled')) setError('Đăng ký tài khoản mới đang bị tắt.');
      else setError(err.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
    }
  };

  const handleGoogleLogin = async () => {
    try { setError(''); await loginWithGoogle(); }
    catch (err: any) { setError(err.message || 'Đăng nhập Google thất bại'); }
  };

  const handleFacebookLogin = async () => {
    try { setError(''); await loginWithFacebook(); }
    catch (err: any) { setError(err.message || 'Đăng nhập Facebook thất bại'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center px-6 py-12 overflow-hidden relative transition-colors duration-300">

      {/* Light mode subtle bg */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#4980DF]/5 rounded-full blur-3xl dark:bg-[#4980DF]/10" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-50 dark:bg-emerald-500/5 rounded-full blur-3xl" />
        {/* Dark mode animated glow */}
        <div className="hidden dark:block absolute -top-1/2 -right-1/2 w-full h-full bg-emerald-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="hidden dark:block absolute -bottom-1/2 -left-1/2 w-full h-full bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Theme toggle — top right */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <Link to="/" className="inline-flex items-center gap-3 mb-4">
            <img src={wealbeeLogoUrl} alt="Wealbee" className="h-9 dark:brightness-0 dark:invert" />
          </Link>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {mode === 'login' ? 'Đăng nhập để tiếp tục' : 'Tạo tài khoản mới'}
          </p>
        </motion.div>

        {/* Auth Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white dark:bg-white/10 dark:backdrop-blur-md border border-slate-200 dark:border-white/20 rounded-3xl p-8 shadow-xl shadow-slate-200/50 dark:shadow-2xl"
        >
          {/* Tab Switcher */}
          <div className="flex gap-2 mb-8 p-1 bg-slate-100 dark:bg-white/5 rounded-xl">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                mode === 'login'
                  ? 'bg-white dark:bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              Đăng nhập
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                mode === 'register'
                  ? 'bg-white dark:bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              Đăng ký
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name (register only) */}
            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Họ và tên</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  required={mode === 'register'}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4980DF] focus:border-transparent transition-all"
                />
              </motion.div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4980DF] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full pl-12 pr-12 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4980DF] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-xs text-slate-400 mt-2">Tối thiểu 6 ký tự</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 dark:bg-red-500/20 border border-red-200 dark:border-red-500/50 rounded-xl p-3 text-sm text-red-600 dark:text-red-200"
              >
                {error}
              </motion.div>
            )}

            {/* Forgot password */}
            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm text-[#4980DF] dark:text-emerald-400 hover:text-[#3a6bc7] dark:hover:text-emerald-300 transition-colors"
                  onClick={() => alert('Chức năng đang phát triển')}
                >
                  Quên mật khẩu?
                </button>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-[#4980DF] hover:bg-[#3a6bc7] text-white font-semibold rounded-xl transition-all transform hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#4980DF]/25"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-white/20" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-4 bg-white dark:bg-transparent text-slate-400">Hoặc tiếp tục với</span>
            </div>
          </div>

          {/* Social Login */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-3 bg-slate-50 dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/20 text-slate-700 dark:text-white font-medium rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Tiếp tục với Google
            </button>

            <button
              type="button"
              onClick={handleFacebookLogin}
              disabled={isLoading}
              className="w-full py-3 bg-slate-50 dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/20 text-slate-700 dark:text-white font-medium rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <svg className="w-5 h-5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Tiếp tục với Facebook
            </button>
          </div>

          {/* Benefits (register) */}
          {mode === 'register' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 p-4 bg-[#4980DF]/5 dark:bg-emerald-500/10 border border-[#4980DF]/20 dark:border-emerald-500/30 rounded-xl"
            >
              <div className="flex items-start gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-[#4980DF] dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[#4980DF] dark:text-emerald-300 font-medium">Đăng ký ngay để nhận</p>
              </div>
              <ul className="space-y-1.5 ml-6">
                {['Theo dõi không giới hạn tài sản', 'Phân tích AI cá nhân hóa', 'Cảnh báo thông minh 24/7'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#4980DF] dark:text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </motion.div>

        {/* Back */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-6"
        >
          <Link to="/" className="text-sm text-slate-400 dark:text-slate-400 hover:text-[#4980DF] dark:hover:text-white transition-colors">
            ← Quay lại trang chủ
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
