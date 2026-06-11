import { cn } from '@/lib/utils';

const variants = {
  primary: 'bg-brand text-white hover:bg-brand-light shadow-sm',
  secondary: 'bg-surface border border-border text-text hover:bg-surface-hover shadow-sm',
  ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text',
  danger: 'bg-danger text-white hover:bg-red-500 shadow-sm',
} as const;

const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
