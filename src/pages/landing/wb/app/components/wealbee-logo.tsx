import svgPaths from "../../imports/App/svg-4h1pcq73wl";

export function WealbeeMark({ size = 32, color = "#0849AC" }: { size?: number; color?: string }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-name="WealbeeIcon">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 35.9926 35.9926">
        <g clipPath="url(#clip0_wb_mark)">
          <path d={svgPaths.p578f80} fill={color} />
          <path d={svgPaths.p1a0b5f00} fill={color} />
          <g>
            <path d={svgPaths.p1969dc00} fill={color} stroke={color} strokeLinejoin="round" strokeWidth="0.719853" />
            <path d={svgPaths.p27399000} fill={color} stroke={color} strokeLinejoin="round" strokeWidth="0.719853" />
            <path d={svgPaths.p2644c080} stroke={color} strokeLinejoin="round" strokeWidth="0.719853" />
          </g>
        </g>
        <defs>
          <clipPath id="clip0_wb_mark">
            <rect fill="white" height="35.9926" width="35.9926" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

export function WealbeeLogo({ size = 30, color = "#0849AC" }: { size?: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <WealbeeMark size={size} color={color} />
      <span
        className="font-semibold tracking-tight"
        style={{ fontFamily: "Montserrat, sans-serif", fontSize: size * 0.62, color }}
      >
        Wealbee
      </span>
    </div>
  );
}
