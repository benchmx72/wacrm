import { cn } from "@/lib/utils";

interface SophiaLogoProps {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  compact?: boolean;
}

export function SophiaLogo({
  className,
  markClassName,
  showWordmark = true,
  compact = false,
}: SophiaLogoProps) {
  const width = showWordmark ? (compact ? 128 : 154) : 40;
  const height = compact ? 34 : 40;

  return (
    <svg
      className={cn("shrink-0", className)}
      width={width}
      height={height}
      viewBox={showWordmark ? "0 0 154 40" : "0 0 40 40"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sophiaNode" x1="4" y1="4" x2="32" y2="34">
          <stop stopColor="#534AB7" />
          <stop offset="1" stopColor="#7F77DD" />
        </linearGradient>
        <filter id="sophiaGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className={markClassName}>
        <line x1="6" y1="8" x2="20" y2="20" stroke="#7F77DD" strokeWidth="1.6" opacity="0.56" />
        <line x1="20" y1="20" x2="6" y2="32" stroke="#7F77DD" strokeWidth="1.6" opacity="0.56" />
        <line x1="20" y1="20" x2="34" y2="11" stroke="#0ABFAD" strokeWidth="1.9" opacity="0.9" />
        <line x1="34" y1="11" x2="34" y2="29" stroke="#7F77DD" strokeWidth="1.5" opacity="0.45" />
        <line x1="6" y1="8" x2="34" y2="11" stroke="#534AB7" strokeWidth="1.1" opacity="0.35" />
        <line x1="6" y1="32" x2="34" y2="29" stroke="#534AB7" strokeWidth="1.1" opacity="0.35" />
        <circle cx="6" cy="8" r="4" fill="#534AB7" filter="url(#sophiaGlow)" />
        <circle cx="6" cy="32" r="4" fill="#534AB7" />
        <circle cx="20" cy="20" r="6.5" fill="url(#sophiaNode)" filter="url(#sophiaGlow)" />
        <circle cx="20" cy="20" r="2.7" fill="#FFFFFF" opacity="0.92" />
        <circle cx="34" cy="11" r="5" fill="#0ABFAD" filter="url(#sophiaGlow)" />
        <circle cx="34" cy="29" r="3.3" fill="#7F77DD" opacity="0.85" />
      </g>

      {showWordmark ? (
        <text
          x="48"
          y="27"
          fill="#FFFFFF"
          fontFamily="var(--font-sans), Arial, sans-serif"
          fontSize={compact ? "17" : "20"}
          fontWeight="800"
          letterSpacing="-0.8"
        >
          <tspan>Soph</tspan>
          <tspan fill="#0ABFAD" dx="-1">
            IA
          </tspan>
        </text>
      ) : null}
    </svg>
  );
}
