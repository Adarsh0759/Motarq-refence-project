// Mark: "N" for Norm — two stems join one path (many OEM formats, one signal),
// with a cyan "signal" dot where the line resolves. Ported from the brand Figma file.
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g clipPath="url(#logo-mark-clip)">
        <rect width="128" height="128" rx="35.84" fill="url(#logo-mark-gradient)" />
        <circle cx="25.6" cy="12.8" r="57.6" fill="white" fillOpacity="0.14" />
        <path d="M36 96V32L92 96V32" stroke="white" strokeWidth="14.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="92" cy="32" r="10.4" fill="#67E8F9" stroke="white" strokeWidth="4.8" />
      </g>
      <defs>
        <linearGradient id="logo-mark-gradient" x1="0" y1="18.29" x2="91.43" y2="109.71" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <clipPath id="logo-mark-clip">
          <rect width="128" height="128" rx="35.84" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function Logo({ size = 32, wordmarkClassName }: { size?: number; wordmarkClassName?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <p className={wordmarkClassName ?? 'text-[20px] font-bold tracking-[-0.4px]'}>
        <span>Fleet</span>
        <span className="text-primary">Norm</span>
      </p>
    </div>
  );
}
