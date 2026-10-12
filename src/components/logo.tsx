export function RadarMark({ className = "size-7", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="var(--accent-ink)" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="5" fill="none" stroke="var(--accent-ink)" strokeOpacity=".55" strokeWidth="1.5" />
      <g className={spinning ? "radar-sweep" : undefined}>
        <path d="M16 16 L16 6.5 A9.5 9.5 0 0 1 24.2 11.2 Z" fill="var(--accent-ink)" fillOpacity=".5" />
        <line x1="16" y1="16" x2="16" y2="6.5" stroke="var(--accent-ink)" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <circle cx="21" cy="12.5" r="1.6" fill="var(--accent-ink)" />
    </svg>
  );
}
