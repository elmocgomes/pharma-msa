import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridReadyEvent } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { IServerSideGetRowsParams, IServerSideDatasource } from 'ag-grid-enterprise';
import { api, type Pharmacy } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Plus, Link2 } from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export function PharmaciesPage() {
  const qc = useQueryClient();
  const gridRef = useRef<AgGridReact>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const scraperStats = useQuery({ queryKey: ['scraper-stats'], queryFn: api.scraper.stats, retry: false });

  const detectChainsMutation = useMutation({
    mutationFn: api.scraper.detectChains,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scraper-stats'] });
      gridRef.current?.api?.refreshServerSide({ purge: true });
    },
  });

  const columnDefs = useMemo<ColDef<Pharmacy>[]>(() => [
    { field: 'name', headerName: 'Name', minWidth: 200, flex: 1, filter: 'agTextColumnFilter' },
    { field: 'cnpj', headerName: 'CNPJ', width: 170, filter: 'agTextColumnFilter' },
    { field: 'phoneNumber', headerName: 'Phone', width: 150, filter: 'agTextColumnFilter' },
    {
      field: 'whatsappNumber', headerName: 'WhatsApp', width: 150, filter: 'agTextColumnFilter',
      cellRenderer: (p: { value: string | null }) =>
        p.value ? `✓ ${p.value}` : '—',
    },
    { field: 'city', headerName: 'City', width: 150, filter: 'agTextColumnFilter' },
    { field: 'state', headerName: 'UF', width: 80, filter: 'agTextColumnFilter' },
    { field: 'bairro', headerName: 'Bairro', width: 140, filter: 'agTextColumnFilter' },
    { field: 'chainName', headerName: 'Chain', width: 150, filter: 'agTextColumnFilter' },
    { field: 'associationName', headerName: 'Association', width: 130, filter: 'agTextColumnFilter' },
    { field: 'porte', headerName: 'Porte', width: 120, filter: 'agTextColumnFilter' },
    { field: 'nomeFantasia', headerName: 'Nome Fantasia', width: 200, filter: 'agTextColumnFilter' },
    { field: 'razaoSocial', headerName: 'Razão Social', width: 250, filter: 'agTextColumnFilter' },
    { field: 'email', headerName: 'Email', width: 200, filter: 'agTextColumnFilter' },
    { field: 'logradouro', headerName: 'Logradouro', width: 200, filter: 'agTextColumnFilter' },
    { field: 'cep', headerName: 'CEP', width: 100, filter: 'agTextColumnFilter' },
    { field: 'naturezaJuridica', headerName: 'Nat. Jurídica', width: 200, filter: 'agTextColumnFilter' },
    {
      field: 'whatsappVerified', headerName: 'WA Verified', width: 110,
      cellRenderer: (p: { value: boolean }) => p.value ? '✓' : '—',
    },
    {
      field: 'createdAt', headerName: 'Added', width: 110,
      valueFormatter: (p: { value: string }) => p.value ? new Date(p.value).toLocaleDateString() : '',
    },
  ], []);

  const datasource = useMemo<IServerSideDatasource>(() => ({
    getRows: async (params: IServerSideGetRowsParams) => {
      const { startRow, endRow, filterModel, sortModel } = params.request;
      const limit = (endRow ?? 100) - (startRow ?? 0);
      const page = Math.floor((startRow ?? 0) / limit) + 1;

      try {
        const qs = new URLSearchParams();
        qs.set('page', String(page));
        qs.set('limit', String(limit));

        if (filterModel) {
          qs.set('filterModel', JSON.stringify(filterModel));
        }
        if (sortModel && sortModel.length > 0) {
          qs.set('sortModel', JSON.stringify(sortModel));
        }

        const res = await fetch(`${BASE}/pharmacies?${qs.toString()}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await res.json();

        setTotalCount(result.pagination.total);
        params.success({
          rowData: result.data,
          rowCount: result.pagination.total,
        });
      } catch {
        params.fail();
      }
    },
  }), []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.setGridOption('serverSideDatasource', datasource);
  }, [datasource]);

  const stats = scraperStats.data;

  return (
    <div className="p-8 space-y-4" style={{ height: 'calc(100vh - 0px)' }}>
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

      {showCreate && <CreatePharmacyForm onClose={() => {
        setShowCreate(false);
        gridRef.current?.api?.refreshServerSide({ purge: true });
      }} />}

      <div className="ag-theme-alpine rounded-xl border border-border overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
        <AgGridReact<Pharmacy>
          ref={gridRef}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            resizable: true,
          }}
          rowModelType="serverSide"
          cacheBlockSize={100}
          maxBlocksInCache={10}
          onGridReady={onGridReady}
          enableAdvancedFilter={true}
          rowSelection="multiple"
          animateRows={false}
          getRowId={(p) => p.data.id}
          sideBar={{
            toolPanels: [
              { id: 'columns', labelDefault: 'Columns', labelKey: 'columns', iconKey: 'columns', toolPanel: 'agColumnsToolPanel' },
            ],
          }}
          statusBar={{
            statusPanels: [
              { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
            ],
          }}
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
