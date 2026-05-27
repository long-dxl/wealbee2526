import svgPaths from "../imports/App-1/svg-qgwp4eiy8b";

interface WealbeeIconProps {
  size?: number;
  color?: string;
}

export function WealbeeIcon({ size = 32, color = "#0849AC" }: WealbeeIconProps) {
  const fill = color;
  const stroke = color;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 35.9926 35.9926"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <g clipPath="url(#clip-wealbee)">
        <path d={svgPaths.p578f80} fill={fill} />
        <path d={svgPaths.p1a0b5f00} fill={fill} />
        <g>
          <path d={svgPaths.p1969dc00} fill={fill} stroke={stroke} strokeLinejoin="round" strokeWidth="0.719853" />
          <path d={svgPaths.p27399000} fill={fill} stroke={stroke} strokeLinejoin="round" strokeWidth="0.719853" />
          <path d={svgPaths.p2644c080} stroke={stroke} strokeLinejoin="round" strokeWidth="0.719853" />
        </g>
      </g>
      <defs>
        <clipPath id="clip-wealbee">
          <rect fill="white" height="35.9926" width="35.9926" />
        </clipPath>
      </defs>
    </svg>
  );
}

interface WealbeLogoProps {
  collapsed?: boolean;
  dark?: boolean;
}

export function WealbeeLogo({ collapsed = false, dark = false }: WealbeLogoProps) {
  const iconColor = dark ? "#ffffff" : "#0849AC";
  const textColor = dark ? "#ffffff" : "#0849AC";

  return (
    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
      <WealbeeIcon size={collapsed ? 32 : 24} color={iconColor} />
      {!collapsed && (
        <span
          style={{
            fontFamily: "'Montserrat', system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "15px",
            color: textColor,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          Wealbee
        </span>
      )}
    </div>
  );
}
