// Temporary vector mark — replace with the official Shomal University logo when provided.
export default function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="شمال‌داک">
      <rect width="48" height="48" rx="12" className="fill-primary" />
      <path d="M10 34 L19 18 L25 27 L30 20 L38 34 Z" fill="hsl(40 88% 56%)" />
      <path d="M10 37 Q17 33 24 37 T38 37" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="33" cy="13" r="3" fill="white" opacity="0.9" />
    </svg>
  );
}
