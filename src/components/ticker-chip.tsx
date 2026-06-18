/**
 * TickerChip — clickable mã cổ phiếu, navigate tới /app/ticker/:symbol
 * Dùng ở bất kỳ trang nào cần hiện mã CP có thể click để xem chi tiết.
 */
import { useNavigate } from "react-router";

interface TickerChipProps {
  symbol: string;
  /** Optional: override màu nền/chữ */
  bg?: string;
  color?: string;
  size?: "sm" | "md";
  className?: string;
}

export function TickerChip({ symbol, bg, color, size = "sm" }: TickerChipProps) {
  const navigate = useNavigate();
  const isSmall = size === "sm";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/app/ticker/${symbol}`);
      }}
      title={`Xem chi tiết ${symbol}`}
      style={{
        padding: isSmall ? "2px 8px" : "4px 12px",
        borderRadius: 6,
        border: `1px solid ${color ? `${color}40` : "rgba(8,73,172,0.2)"}`,
        background: bg ?? "rgba(8,73,172,0.07)",
        color: color ?? "#0849AC",
        fontSize: isSmall ? 11 : 13,
        fontWeight: 700,
        fontFamily: "'Montserrat', system-ui, sans-serif",
        cursor: "pointer",
        letterSpacing: "0.04em",
        transition: "all 0.15s",
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = color ? `${color}18` : "rgba(8,73,172,0.14)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = bg ?? "rgba(8,73,172,0.07)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      {symbol}
    </button>
  );
}
