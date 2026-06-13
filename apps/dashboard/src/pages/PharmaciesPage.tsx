import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type IGetRowsParams, type GridReadyEvent } from 'ag-grid-community';
import { api, type Pharmacy } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Plus, Search, Link2, RefreshCw } from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule]);

export function PharmaciesPage() {
  const qc = useQueryClient();
  const gridRef = useRef<AgGridReact>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [chainFilter, setChainFilter] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  const states = useQuery({ queryKey: ['pharmacy-states'], queryFn: api.pharmacies.states });
  const chains = useQuery({ queryKey: ['pharmacy-chains'], queryFn: api.pharmacies.chains });
  const scraperStats = useQuery({ queryKey: ['scraper-stats'], queryFn: api.scraper.stats, retry: false });

  const detectChainsMutation = useMutation({
    mutationFn: api.scraper.detectChains,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pharmacy-chains'] });
      qc.invalidateQueries({ queryKey: ['scraper-stats'] });
      gridRef.current?.api?.refreshInfiniteCache();
    },
  });

  const columnDefs = useMemo<ColDef<Pharmacy>[]>(() => [
    { field: 'name', headerName: 'Name', minWidth: 200, flex: 1 },
    { field: 'cnpj', headerName: 'CNPJ', width: 170 },
    { field: 'phoneNumber', headerName: 'Phone', width: 150 },
    {
      field: 'whatsappNumber', headerName: 'WhatsApp', width: 150,
      cellRenderer: (p: { value: string | null }) =>
        p.value ? `✓ ${p.value}` : '—',
    },
    { field: 'city', headerName: 'City', width: 150 },
    { field: 'state', headerName: 'UF', width: 70 },
    { field: 'bairro', headerName: 'Bairro', width: 140 },
    { field: 'chainName', headerName: 'Chain', width: 150 },
    { field: 'associationName', headerName: 'Association', width: 120 },
    { field: 'porte', headerName: 'Porte', width: 120 },
    { field: 'nomeFantasia', headerName: 'Nome Fantasia', width: 200 },
    { field: 'razaoSocial', headerName: 'Razão Social', width: 250 },
    { field: 'email', headerName: 'Email', width: 200 },
    { field: 'logradouro', headerName: 'Logradouro', width: 200 },
    { field: 'cep', headerName: 'CEP', width: 100 },
    { field: 'naturezaJuridica', headerName: 'Nat. Jurídica', width: 200 },
    {
      field: 'createdAt', headerName: 'Added', width: 100,
      valueFormatter: (p: { value: string }) => p.value ? new Date(p.value).toLocaleDateString() : '',
    },
  ], []);

  const datasource = useMemo(() => ({
    getRows: async (params: IGetRowsParams) => {
      const page = Math.floor(params.startRow / 100) + 1;
      try {
        const result = await api.pharmacies.list({
          page,
          limit: 100,
          q: search || undefined,
          state: stateFilter || undefined,
          chain: chainFilter || undefined,
        });
        setTotalCount(result.pagination.total);
        const lastRow = result.pagination.total <= params.startRow + result.data.length
          ? params.startRow + result.data.length
          : -1;
        params.successCallback(result.data, lastRow);
      } catch {
        params.failCallback();
      }
    },
  }), [search, stateFilter, chainFilter]);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.setGridOption('datasource', datasource);
  }, [datasource]);

  // Refresh when filters change
  const refreshGrid = useCallback(() => {
    const api = gridRef.current?.api;
    if (api) {
      api.setGridOption('datasource', datasource);
    }
  }, [datasource]);

  const stats = scraperStats.data;

  return (
    <div className="p-8 space-y-4" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pharmacies</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {totalCount.toLocaleString()} pharmacies
            {stats ? ` · ${stats.withWhatsApp} with WhatsApp · ${stats.withChain} in chains` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => detectChainsMutation.mutate()}
            disabled={detectChainsMutation.isPending}>
            <Link2 className="h-3.5 w-3.5" />
            {detectChainsMutation.isPending ? 'Detecting...' : 'Detect Chains'}
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
          <input
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm"
            placeholder="Search name, CNPJ, phone, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') refreshGrid(); }}
          />
        </div>
        <select className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); }}>
          <option value="">All states</option>
          {(states.data ?? []).map((s) => (
            <option key={s.state} value={s.state}>{s.state} ({s.count})</option>
          ))}
        </select>
        <select className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          value={chainFilter} onChange={(e) => { setChainFilter(e.target.value); }}>
          <option value="">All chains</option>
          {(chains.data ?? []).map((c) => (
            <option key={c.chainName} value={c.chainName}>{c.chainName} ({c.count})</option>
          ))}
        </select>
        <Button variant="secondary" size="sm" onClick={refreshGrid}>
          <RefreshCw className="h-3.5 w-3.5" /> Filter
        </Button>
      </div>

      {showCreate && <CreatePharmacyForm onClose={() => { setShowCreate(false); refreshGrid(); }} />}

      {/* AG Grid */}
      <div className="ag-theme-alpine rounded-xl border border-border overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
        <AgGridReact<Pharmacy>
          ref={gridRef}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            resizable: true,
            filter: false,
          }}
          rowModelType="infinite"
          cacheBlockSize={100}
          cacheOverflowSize={2}
          maxConcurrentDatasourceRequests={1}
          infiniteInitialRowCount={100}
          maxBlocksInCache={10}
          onGridReady={onGridReady}
          rowSelection="multiple"
          animateRows={false}
          getRowId={(p) => p.data.id}
        />
      </div>
    </div>
  );
}

function CreatePharmacyForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const create = useMutation({
    mutationFn: (data: { name: string; phoneNumber: string; city?: string; state?: string }) =>
      api.pharmacies.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pharmacies'] });
      onClose();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Pharmacy</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name || !phone) return;
            create.mutate({ name, phoneNumber: phone, city: city || undefined, state: state || undefined });
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className="text-xs font-medium text-text-secondary">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drogaria Sao Paulo" required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Phone Number *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 5511999999999" required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Sao Paulo"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">State</label>
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. SP"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" disabled={create.isPending || !name || !phone}>
              <Building2 className="h-3.5 w-3.5" />
              {create.isPending ? 'Adding...' : 'Add Pharmacy'}
            </Button>
          </div>
          {create.isError && <p className="col-span-2 text-sm text-red-500">{(create.error as Error).message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
