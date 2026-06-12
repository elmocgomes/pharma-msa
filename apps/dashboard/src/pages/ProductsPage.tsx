import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Pill, Plus, Trash2 } from 'lucide-react';

export function ProductsPage() {
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ['products'], queryFn: api.products.list });
  const [showCreate, setShowCreate] = useState(false);

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.products.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Products</h1>
          <p className="text-sm text-text-secondary mt-0.5">Pharmaceutical products for inquiry</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add Product
        </Button>
      </div>

      {showCreate && <CreateProductForm onClose={() => setShowCreate(false)} />}

      {products.data?.length === 0 ? (
        <EmptyState
          icon={<Pill className="h-10 w-10" />}
          title="No products"
          description="Add pharmaceutical products to inquire about"
          action={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> Add Product</Button>}
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_160px_120px_120px_100px_60px] gap-4 px-6 py-3 bg-surface-dim border-b border-border-dim text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
            <span>Name</span>
            <span>Active Ingredient</span>
            <span>Brand</span>
            <span>Category</span>
            <span>Type</span>
            <span></span>
          </div>
          <div className="divide-y divide-border-dim">
            {products.data?.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_160px_120px_120px_100px_60px] gap-4 px-6 py-3 items-center">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-text-tertiary font-mono">{p.id.slice(0, 12)}</p>
                </div>
                <span className="text-sm text-text-secondary">{p.activeIngredient ?? '-'}</span>
                <span className="text-sm text-text-secondary">{p.brand ?? '-'}</span>
                <span className="text-sm text-text-secondary">{p.category ?? '-'}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block text-center ${
                  p.productType === 'generic' ? 'bg-green-100 text-green-700' :
                  p.productType === 'similar' ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {p.productType ?? 'reference'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (confirm(`Delete ${p.name}?`)) deleteProduct.mutate(p.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-text-tertiary" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateProductForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [dosage, setDosage] = useState('');
  const [productType, setProductType] = useState('reference');

  const create = useMutation({
    mutationFn: (data: { name: string; activeIngredient?: string; brand?: string; category?: string; dosage?: string; productType?: string }) =>
      api.products.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Product</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name) return;
            create.mutate({
              name,
              activeIngredient: activeIngredient || undefined,
              brand: brand || undefined,
              category: category || undefined,
              dosage: dosage || undefined,
              productType,
            });
          }}
          className="grid grid-cols-3 gap-3"
        >
          <div>
            <label className="text-xs font-medium text-text-secondary">Product Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Losartana 50mg"
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Active Ingredient</label>
            <input
              value={activeIngredient}
              onChange={(e) => setActiveIngredient(e.target.value)}
              placeholder="e.g. Losartana Potassica"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Brand</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Cozaar"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Anti-hipertensivo"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Dosage</label>
            <input
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="e.g. 50mg"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Type</label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand bg-surface"
            >
              <option value="reference">Reference (Original)</option>
              <option value="similar">Similar (Branded Generic)</option>
              <option value="generic">Generic</option>
            </select>
          </div>
          <div className="col-span-3 flex justify-end">
            <Button type="submit" disabled={create.isPending || !name}>
              <Pill className="h-3.5 w-3.5" />
              {create.isPending ? 'Adding...' : 'Add Product'}
            </Button>
          </div>
          {create.isError && (
            <p className="col-span-3 text-sm text-red-500">{(create.error as Error).message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
