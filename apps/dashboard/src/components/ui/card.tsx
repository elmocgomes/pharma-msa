import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('flex items-center justify-between px-6 py-4 border-b border-border-dim', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h3 className={cn('text-sm font-semibold text-text', className)}>{children}</h3>;
}

export function CardContent({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('px-6 py-4', className)} {...props}>
      {children}
    </div>
  );
}

export function MetricCard({ label, value, sub, icon }: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-dim text-brand">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-text">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-text-tertiary">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
