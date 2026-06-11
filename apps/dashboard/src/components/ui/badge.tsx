import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-success-dim text-emerald-700',
  warning: 'bg-warning-dim text-amber-700',
  danger: 'bg-danger-dim text-red-700',
  info: 'bg-info-dim text-blue-700',
  brand: 'bg-brand-dim text-indigo-700',
} as const;

interface BadgeProps {
  variant?: keyof typeof variants;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ variant = 'default', children, className, dot }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
      variants[variant],
      className,
    )}>
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', {
          'bg-gray-500': variant === 'default',
          'bg-emerald-500': variant === 'success',
          'bg-amber-500': variant === 'warning',
          'bg-red-500': variant === 'danger',
          'bg-blue-500': variant === 'info',
          'bg-indigo-500': variant === 'brand',
        })} />
      )}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: keyof typeof variants; label: string }> = {
    connected: { variant: 'success', label: 'Connected' },
    connecting: { variant: 'warning', label: 'Connecting' },
    disconnected: { variant: 'danger', label: 'Disconnected' },
    running: { variant: 'success', label: 'Running' },
    draft: { variant: 'default', label: 'Draft' },
    paused: { variant: 'warning', label: 'Paused' },
    completed: { variant: 'success', label: 'Completed' },
    pending: { variant: 'default', label: 'Pending' },
    greeting: { variant: 'info', label: 'Greeting' },
    in_progress: { variant: 'brand', label: 'In Progress' },
    waiting_response: { variant: 'warning', label: 'Waiting' },
    recovery: { variant: 'warning', label: 'Recovery' },
    extracting: { variant: 'info', label: 'Extracting' },
    failed: { variant: 'danger', label: 'Failed' },
    timeout: { variant: 'danger', label: 'Timeout' },
    error: { variant: 'danger', label: 'Error' },
  };

  const c = config[status] ?? { variant: 'default' as const, label: status };
  return <Badge variant={c.variant} dot>{c.label}</Badge>;
}
