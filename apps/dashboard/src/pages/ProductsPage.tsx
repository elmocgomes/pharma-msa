import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AnvisaProduct } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Pill, Plus, Trash2, Search, Database, Download } from 'lucide-react';

export function ProductsPage() {
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ['products'], queryFn: api.products.list });
  const [showCreate, setShowCreate] = useState(false);
  const [showAnvisaSearch, setShowAnvisaSearch] = useState(false);

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.products.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Products</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Pharmaceutical products for inquiry ({products.data?.length ?? 0} products)
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowAnvisaSearch(true)}>
            <Database className="h-3.5 w-3.5" />
            Import from Anvisa
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Manually
          </Button>
        </div>
      </div>

      {showAnvisaSearch && <AnvisaImportPanel onClose={() => setShowAnvisaSearch(false)} />}
      {showCreate && <CreateProductForm onClose={() => setShowCreate(false)} />}

      {products.data?.length === 0 ? (
        <EmptyState
          icon={<Pill className="h-10 w-10" />}
          title="No products"
          description="Import products from the Anvisa CMED catalog or add them manually"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowAnvisaSearch(true)}>
                <Database className="h-3.5 w-3.5" /> Import from Anvisa
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Manually
              </Button>
            </div>
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_180px_140px_140px_100px_60px] gap-4 px-6 py-3 bg-surface-dim border-b border-border-dim text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
            <span>Name</span>
            <span>Active Ingredient</span>
            <span>Brand / Lab</span>
            <span>Dosage</span>
            <span>Type</span>
            <span></span>
          </div>
          <div className="divide-y divide-border-dim">
            {products.data?.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_180px_140px_140px_100px_60px] gap-4 px-6 py-3 items-center">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  {p.category && <p className="text-[10px] text-text-tertiary">{p.category}</p>}
                </div>
                <span className="text-xs text-text-secondary truncate">{p.activeIngredient ?? '-'}</span>
                <span className="text-xs text-text-secondary truncate">{p.brand ?? '-'}</span>
                <span className="text-xs text-text-tertiary truncate">{p.dosage ?? '-'}</span>
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

function AnvisaImportPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  const results = useQuery({
    queryKey: ['anvisa-import-search', searchQuery],
    queryFn: () => api.anvisa.search({ q: searchQuery, limit: 20 }),
    enabled: searchQuery.length > 0,
  });

  const importMutation = useMutation({
    mutationFn: (anvisaId: string) => api.products.fromAnvisa(anvisaId),
    onSuccess: (_, anvisaId) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setImportedIds((prev) => new Set([...prev, anvisaId]));
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(q);
  }

  const typeColor: Record<string, string> = {
    'Novo': 'bg-blue-100 text-blue-700',
    'Similar': 'bg-amber-100 text-amber-700',
    'Genérico': 'bg-green-100 text-green-700',
    'Biológico': 'bg-purple-100 text-purple-700',
    'Específico': 'bg-gray-100 text-gray-700',
    'Fitoterápico': 'bg-emerald-100 text-emerald-700',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          Import from Anvisa CMED (25,392 products)
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-tertiary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by product name, active ingredient, or lab..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-border text-sm focus:outline-brand focus:border-brand"
              autoFocus
            />
          </div>
          <Button type="submit">
            <Search className="h-3.5 w-3.5" />
            Search
          </Button>
        </form>

        {!searchQuery ? (
          <p className="text-sm text-text-tertiary text-center py-4">
            Search the Anvisa catalog to find products to import
          </p>
        ) : results.isLoading ? (
          <p className="text-sm text-text-tertiary text-center py-4">Searching...</p>
        ) : results.data?.data.length === 0 ? (
          <p className="text-sm text-text-tertiary text-center py-4">No results found</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border divide-y divide-border-dim">
            {results.data?.data.map((p: AnvisaProduct) => {
              const imported = importedIds.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{p.produto}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                        typeColor[p.tipoProduto] ?? 'bg-gray-100 text-gray-700'
                      }`}>
                        {p.tipoProduto}
                      </span>
                    </div>
                    <p className="text-xs text-text-tertiary truncate">{p.apresentacao}</p>
                    <div className="flex gap-3 mt-0.5 text-[10px] text-text-tertiary">
                      <span>{p.substancia}</span>
                      {p.laboratorio && <span>| {p.laboratorio}</span>}
                      {p.ean && <span>| EAN: {p.ean}</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={imported ? 'ghost' : 'secondary'}
                    disabled={imported || importMutation.isPending}
                    onClick={() => importMutation.mutate(p.id)}
                  >
                    {imported ? (
                      <>Imported</>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Import
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {results.data && results.data.pagination.total > 20 && (
          <p className="text-xs text-text-tertiary text-center">
            Showing 20 of {results.data.pagination.total.toLocaleString()} results. Refine your search for more specific results.
          </p>
        )}
      </CardContent>
    </Card>
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
        <CardTitle>Add Product Manually</CardTitle>
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
            <label className="text-xs font-medium text-text-secondary">Brand / Lab</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Merck"
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
            <label className="text-xs font-medium text-text-secondary">Dosage / Presentation</label>
            <input
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="e.g. 50mg comprimido"
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
