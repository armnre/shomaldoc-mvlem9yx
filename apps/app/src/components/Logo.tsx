import { cn } from '@project/components/lib/utils';

export const LOGO_URL = '/brand/university-logo.jpg';

/** Official Shomal University logo (apps/app/public/brand/university-logo.jpg). */
export default function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return <img src={LOGO_URL} alt="لوگوی دانشگاه شمال" className={cn('rounded-lg bg-white object-contain p-0.5', className)} />;
}
