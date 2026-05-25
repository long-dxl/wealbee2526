import React from "react";

interface WealbeeIconProps {
  size?: number;
  color?: string;
  className?: string;
}

export function WealbeeIcon({ size = 24, color = "#0849AC", className }: WealbeeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Hexagon / bee-inspired W shape */}
      <path
        d="M4 6L8 18L12 10L16 18L20 6"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12" cy="4.5" r="1.5" fill={color} opacity="0.6" />
    </svg>
  );
}
