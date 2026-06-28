import React, { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring } from "motion/react";

/* ───────────────────────── Button ─────────────────────────
 * Single token-driven button used for every CTA across the site.
 * Colors come from the Wealbee theme tokens, so it adapts to
 * light/dark automatically. Shape rule (Fortune-500 convention):
 *   – inline / auto-width CTAs  → pill (rounded-full)
 *   – full-width CTAs (cards, forms) → 12px radius
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "white";
type ButtonSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "gap-1.5 px-3.5 py-1.5 text-[12.5px]",
  sm: "gap-1.5 px-4 py-2 text-[14px]",
  md: "gap-2 px-6 py-3 text-[15px]",
  lg: "gap-2 px-7 py-3.5 text-[16px]",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--wb-primary)] text-white font-semibold shadow-[0_10px_30px_var(--wb-glow)] hover:-translate-y-0.5",
  secondary:
    "border border-[var(--wb-border)] text-[var(--wb-text)] font-medium hover:-translate-y-0.5 hover:border-[var(--wb-primary)]",
  ghost: "text-[var(--wb-muted)] font-medium hover:text-[var(--wb-text)]",
  white:
    "bg-white text-[var(--wb-primary)] font-bold shadow-[0_18px_50px_rgba(0,0,0,0.22)] hover:-translate-y-0.5",
};

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style" | "children">;

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  href,
  className = "",
  style,
  children,
  ...props
}: ButtonProps) {
  const cls = [
    "inline-flex items-center justify-center whitespace-nowrap transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    fullWidth ? "w-full rounded-[12px]" : "rounded-full",
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    className,
  ].join(" ");

  const mergedStyle = {
    fontFamily: "Montserrat, sans-serif",
    ["--tw-ring-color" as string]: "var(--wb-bright)",
    ["--tw-ring-offset-color" as string]: "var(--wb-canvas)",
    ...style,
  } as React.CSSProperties;

  if (href) {
    return (
      <a href={href} className={cls} style={mergedStyle} {...(props as Record<string, unknown>)}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} style={mergedStyle} {...props}>
      {children}
    </button>
  );
}

/* Stock ticker rendered as a clickable chip */
export function Ticker({ symbol }: { symbol: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center rounded-md border px-1.5 py-px align-middle transition-colors hover:border-[var(--wb-primary)]"
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "0.85em",
        color: "var(--wb-bright)",
        borderColor: "var(--wb-border)",
        background: "color-mix(in srgb, var(--wb-primary) 12%, transparent)",
      }}
    >
      {symbol}
    </button>
  );
}

/* Citation tag - orange, underlines on hover */
export function Citation({ source, date }: { source: string; date: string }) {
  return (
    <button
      type="button"
      className="cursor-pointer underline-offset-2 hover:underline"
      style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.82em", color: "var(--wb-cite)" }}
    >
      [{source} | {date}]
    </button>
  );
}

/* Number that counts up when scrolled into view */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.6,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} style={{ fontFamily: "Montserrat, sans-serif" }}>
      {prefix}
      {display.toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* Fade + rise + focus-in (blur→sharp) on scroll into view.
 * Premium scroll-reveal used across the site. Replays every time the element
 * enters the viewport — so scrolling back to the top then down again, or
 * reloading the page, animates the content in again. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  blur = true,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  blur?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: blur ? "blur(7px)" : "blur(0px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: false, margin: "-90px" }}
      transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: "transform, opacity, filter" }}
    >
      {children}
    </motion.div>
  );
}

/* Small uppercase eyebrow label */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="uppercase"
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        letterSpacing: "0.16em",
        color: "var(--wb-bright)",
      }}
    >
      {children}
    </span>
  );
}

export { motion, useMotionValue, useSpring };
