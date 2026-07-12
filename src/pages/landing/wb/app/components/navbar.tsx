import { useEffect, useState } from "react";
import { Moon, Sun, Menu, X } from "lucide-react";
import { Link } from "react-router";
import { WealbeeLogo } from "./wealbee-logo";
import { Button } from "./primitives";

const LINKS = [
  { label: "Tính năng", href: "#features" },
  { label: "Cách hoạt động", href: "#how" },
  { label: "Bảng giá", href: "#pricing" },
  { label: "Dành cho ai", href: "#personas" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar({ theme, onToggleTheme, onOpenDemo }: { theme: "dark" | "light"; onToggleTheme: () => void; onOpenDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-all"
      style={{
        background: scrolled ? "color-mix(in srgb, var(--wb-canvas) 78%, transparent)" : "transparent",
        backdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom: scrolled ? "1px solid var(--wb-border)" : "1px solid transparent",
      }}
    >
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5">
        <a href="#top" className="flex items-center">
          <WealbeeLogo size={30} />
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 transition-colors hover:text-[var(--wb-text)]"
              style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 14, color: "var(--wb-muted)" }}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Chuyển giao diện sáng/tối"
            className="flex size-9 items-center justify-center rounded-full border transition-colors hover:border-[var(--wb-primary)]"
            style={{ borderColor: "var(--wb-border)", color: "var(--wb-text)" }}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {/* Đăng nhập phải thấy ngay trên navbar cả mobile — user cũ vào landing chủ yếu để login,
              giấu trong hamburger là mất lối vào. Mobile: pill viền gọn; desktop: text link như cũ. */}
          <Link
            to="/login"
            className="rounded-full border px-3.5 py-1.5 transition-opacity hover:opacity-70 sm:hidden"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 13.5, color: "var(--wb-text)", textDecoration: "none", borderColor: "var(--wb-border)" }}
          >
            Đăng nhập
          </Link>
          <Link
            to="/login"
            className="hidden rounded-full px-4 py-2 transition-opacity hover:opacity-70 sm:block"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 14, color: "var(--wb-muted)", textDecoration: "none" }}
          >
            Đăng nhập
          </Link>
          <Button type="button" onClick={onOpenDemo} variant="primary" size="sm" className="max-sm:hidden">
            Yêu cầu Demo
          </Button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Mở menu"
            className="flex size-9 items-center justify-center rounded-full border lg:hidden"
            style={{ borderColor: "var(--wb-border)", color: "var(--wb-text)" }}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t px-5 py-4 lg:hidden" style={{ borderColor: "var(--wb-border)", background: "var(--wb-canvas)" }}>
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5"
                style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 15, color: "var(--wb-text)" }}
              >
                {l.label}
              </a>
            ))}
            {/* Đăng nhập bị ẩn khỏi thanh nav ở <640px (hidden sm:block) — phải có trong menu
                mobile, nếu không user điện thoại không có đường đăng nhập từ landing */}
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5"
              style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 15, color: "var(--wb-text)", textDecoration: "none" }}
            >
              Đăng nhập
            </Link>
            <Button
              type="button"
              onClick={() => { setOpen(false); onOpenDemo(); }}
              variant="primary"
              size="md"
              fullWidth
              className="mt-2"
            >
              Yêu cầu Demo
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
