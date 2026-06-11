import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty';
import { Pill } from 'lucide-react';

export function ProductsPage() {
  const products = useQuery({ queryKey: ['products'], queryFn: api.products.list });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Products</h1>
        <p className="text-sm text-text-secondary mt-0.5">Pharmaceutical products for inquiry</p>
      </div>

      {products.data?.length === 0 ? (
        <EmptyState
          icon={<Pill className="h-10 w-10" />}
          title="No products"
          description="Add products via the API"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_180px_140px_120px] gap-4 px-6 py-3 bg-surface-dim border-b border-border-dim text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
            <span>Name</span>
            <span>Active Ingredient</span>
            <span>Brand</span>
            <span>Category</span>
          </div>
          <div className="divide-y divide-border-dim">
            {products.data?.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_180px_140px_120px] gap-4 px-6 py-3 items-center">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-text-tertiary font-mono">{p.id.slice(0, 12)}</p>
                </div>
                <span className="text-sm text-text-secondary">{p.activeIngredient ?? '-'}</span>
                <span className="text-sm text-text-secondary">{p.brand ?? '-'}</span>
                <span className="text-sm text-text-secondary">{p.category ?? '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
