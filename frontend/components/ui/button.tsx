import * as React from 'react';

import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants: Record<string, string> = {
      default:
        'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-110 active:brightness-95',
      ghost: 'text-[hsl(var(--foreground))] hover:bg-white/5',
      outline: 'border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-white/5',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          variants[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
