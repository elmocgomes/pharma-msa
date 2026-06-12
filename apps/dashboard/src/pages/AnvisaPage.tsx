import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type AnvisaProduct } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Search, Database, ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react';

const BRAZILIAN_STATES = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

const TIPO_OPTIONS = ['Novo', 'Similar', 'Genérico', 'Biológico', 'Específico', 'Fitoterápico'];

export function AnvisaPage() {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [state, setState] = useState('SP');
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const stats = useQuery({ queryKey: ['anvisa-stats'], queryFn: api.anvisa.stats });

  const results = useQuery({
    queryKey: ['anvisa-search', searchQuery, tipo, state, page],
    queryFn: () => api.anvisa.search({ q: searchQuery, tipo: tipo || undefined, state, page, limit: 30 }),
    enabled: true,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(q);
    setPage(1);
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Anvisa Products (CMED)</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {stats.data ? `${stats.data.total.toLocaleString()} products loaded` : 'Official drug price list'}
          </p>
        </div>
      </div>

      {/* Stats bar */}
      {stats.data && stats.data.total > 0 && (
        <div className="flex gap-2 flex-wrap">
          {stats.data.byType.map((t) => (
            <button
              key={t.tipoProduto}
              onClick={() => { setTipo(tipo === t.tipoProduto ? '' : t.tipoProduto); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tipo === t.tipoProduto
                  ? 'bg-brand text-white'
                  : 'bg-surface-dim text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {t.tipoProduto} ({t.count.toLocaleString()})
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by product name, substance, or lab..."
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-border text-sm focus:outline-brand focus:border-brand"
          />
        </div>
        <select
          value={state}
          onChange={(e) => { setState(e.target.value); setPage(1); }}
          className="rounded-lg border border-border px-3 py-2 text-sm bg-surface focus:outline-brand"
        >
          {BRAZILIAN_STATES.map((uf) => (
            <option key={uf} value={uf}>PMC {uf}</option>
          ))}
        </select>
        <Button type="submit">
          <Search className="h-3.5 w-3.5" />
          Search
        </Button>
      </form>

      {/* Results */}
      {stats.data?.total === 0 ? (
        <EmptyState
          icon={<Database className="h-10 w-10" />}
          title="No Anvisa data"
          description="Import the CMED price list first using the import script"
        />
      ) : results.data?.data.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-10 w-10" />}
          title="No results"
          description="Try a different search term or filter"
        />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_200px_120px_100px_100px_90px] gap-3 px-5 py-2.5 bg-surface-dim border-b border-border-dim text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
              <span>Product</span>
              <span>Active Ingredient</span>
              <span>Lab</span>
              <span>Type</span>
              <span>PMC ({state})</span>
              <span>Tarja</span>
            </div>
            <div className="divide-y divide-border-dim">
              {results.data?.data.map((p) => (
                <ProductRow key={p.id} product={p} state={state} />
              ))}
            </div>
          </div>

          {/* Pagination */}
          {results.data && results.data.pagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                Page {results.data.pagination.page} of {results.data.pagination.pages}
                {' '}({results.data.pagination.total.toLocaleString()} results)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= results.data.pagination.pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProductRow({ product: p, state }: { product: AnvisaProduct; state: string }) {
  const [expanded, setExpanded] = useState(false);

  const competitors = useQuery({
    queryKey: ['anvisa-competitors', p.substancia, state],
    queryFn: () => api.anvisa.bySubstance(p.substancia, state),
    enabled: expanded,
  });

  const typeColor = {
    'Novo': 'bg-blue-100 text-blue-700',
    'Similar': 'bg-amber-100 text-amber-700',
    'Genérico': 'bg-green-100 text-green-700',
    'Biológico': 'bg-purple-100 text-purple-700',
    'Específico': 'bg-gray-100 text-gray-700',
    'Fitoterápico': 'bg-emerald-100 text-emerald-700',
  }[p.tipoProduto] ?? 'bg-gray-100 text-gray-700';

  const tarjaColor = {
    'Vermelha': 'text-red-600',
    'Vermelha sob restrição': 'text-red-800',
    'Preta': 'text-gray-900 font-bold',
    'Sem Tarja': 'text-green-600',
  }[p.tarja ?? ''] ?? 'text-text-tertiary';

  return (
    <>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full grid grid-cols-[1fr_200px_120px_100px_100px_90px] gap-3 px-5 py-2.5 text-left hover:bg-surface-hover transition-colors items-center"
      >
        <div>
          <p className="text-sm font-medium">{p.produto}</p>
          <p className="text-xs text-text-tertiary truncate">{p.apresentacao}</p>
        </div>
        <span className="text-xs text-text-secondary truncate">{p.substancia}</span>
        <span className="text-xs text-text-tertiary truncate">{p.laboratorio ?? '-'}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full text-center ${typeColor}`}>
          {p.tipoProduto}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {p.pmc != null ? `R$ ${p.pmc.toFixed(2)}` : '-'}
        </span>
        <span className={`text-xs ${tarjaColor}`}>{p.tarja ?? '-'}</span>
      </button>

      {/* Expanded: show competitors (same substance) */}
      {expanded && (
        <div className="bg-surface-dim px-5 py-3 border-t border-border-dim">
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Competing Products ({p.substancia}) — {competitors.data?.count ?? '...'} total
          </h4>
          {competitors.isLoading ? (
            <p className="text-xs text-text-tertiary">Loading competitors...</p>
          ) : (
            <div className="grid grid-cols-[1fr_200px_100px_100px_80px] gap-2 text-xs">
              {competitors.data?.products
                .filter((c) => c.id !== p.id)
                .slice(0, 20)
                .map((c) => (
                  <div key={c.id} className="contents">
                    <div>
                      <span className="font-medium">{c.produto}</span>
                      <span className="text-text-tertiary ml-1">{c.apresentacao.slice(0, 40)}</span>
                    </div>
                    <span className="text-text-tertiary truncate">{c.laboratorio ?? '-'}</span>
                    <span className={`font-medium px-1.5 py-0.5 rounded text-center ${
                      c.tipoProduto === 'Genérico' ? 'bg-green-50 text-green-700' :
                      c.tipoProduto === 'Similar' ? 'bg-amber-50 text-amber-700' :
                      'bg-blue-50 text-blue-700'
                    }`}>
                      {c.tipoProduto}
                    </span>
                    <span className="tabular-nums font-medium">
                      {c.pmc != null ? `R$ ${c.pmc.toFixed(2)}` : '-'}
                    </span>
                    <span className="text-text-tertiary">{c.ean ?? '-'}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
