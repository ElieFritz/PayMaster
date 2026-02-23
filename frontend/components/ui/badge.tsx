import { cn } from '@/lib/utils';

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-[#9f8a4b]/50 bg-[#1c1710] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#e3c979]',
        className,
      )}
    >
      {children}
    </span>
  );
}
