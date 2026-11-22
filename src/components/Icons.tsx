// Small stroke icons (24×24), sized and coloured by the parent via className.
type P = { className?: string };
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', 'aria-hidden': true };

export const FlameIcon = ({ className = 'h-3.5 w-3.5' }: P) => (
  <svg {...base} className={className}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
);
export const ClockIcon = ({ className = 'h-3.5 w-3.5' }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
);
export const MenuIcon = ({ className = 'h-5 w-5' }: P) => (
  <svg {...base} className={className}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);
export const ChevronDownIcon = ({ className = 'h-4 w-4' }: P) => (
  <svg {...base} className={className}><path d="m6 9 6 6 6-6" /></svg>
);
export const MapPinIcon = ({ className = 'h-[18px] w-[18px]' }: P) => (
  <svg {...base} className={className}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
);
export const PhoneIcon = ({ className = 'h-[18px] w-[18px]' }: P) => (
  <svg {...base} className={className}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
);
export const InstagramIcon = ({ className = 'h-[18px] w-[18px]' }: P) => (
  <svg {...base} className={className}><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><path d="M17.5 6.5h.01" /></svg>
);
export const FacebookIcon = ({ className = 'h-[18px] w-[18px]' }: P) => (
  <svg {...base} className={className}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
);
export const TiktokIcon = ({ className = 'h-[18px] w-[18px]' }: P) => (
  <svg {...base} className={className}><path d="M9 12a4 4 0 1 0 4 4V3c.5 2.5 2.5 4.5 5 5" /></svg>
);
