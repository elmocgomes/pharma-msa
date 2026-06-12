import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Building2, Phone, MapPin, Plus, Trash2 } from 'lucide-react';

export function PharmaciesPage() {
  const qc = useQueryClient();
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: api.pharmacies.list });
  const [showCreate, setShowCreate] = useState(false);

  const deletePharmacy = useMutation({
    mutationFn: (id: string) => api.pharmacies.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pharmacies'] }),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pharmacies</h1>
          <p className="text-sm text-text-secondary mt-0.5">Target pharmacies for mystery shopping</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add Pharmacy
        </Button>
      </div>

      {showCreate && <CreatePharmacyForm onClose={() => setShowCreate(false)} />}

      {pharmacies.data?.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="No pharmacies"
          description="Add pharmacies to target for mystery shopping"
          action={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> Add Pharmacy</Button>}
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_180px_150px_120px_60px] gap-4 px-6 py-3 bg-surface-dim border-b border-border-dim text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
            <span>Name</span>
            <span>Phone</span>
            <span>Location</span>
            <span>Added</span>
            <span></span>
          </div>
          <div className="divide-y divide-border-dim">
            {pharmacies.data?.map((ph) => (
              <div key={ph.id} className="grid grid-cols-[1fr_180px_150px_120px_60px] gap-4 px-6 py-3 items-center">
                <div>
                  <p className="text-sm font-medium">{ph.name}</p>
                  <p className="text-xs text-text-tertiary font-mono">{ph.id.slice(0, 12)}</p>
                </div>
                <span className="text-sm text-text-secondary flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-text-tertiary" />
                  {ph.phoneNumber}
                </span>
                <span className="text-sm text-text-secondary flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-text-tertiary" />
                  {[ph.city, ph.state].filter(Boolean).join(', ') || '-'}
                </span>
                <span className="text-xs text-text-tertiary">
                  {new Date(ph.createdAt).toLocaleDateString()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (confirm(`Delete ${ph.name}?`)) deletePharmacy.mutate(ph.id); }}
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
            create.mutate({
              name,
              phoneNumber: phone,
              city: city || undefined,
              state: state || undefined,
            });
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className="text-xs font-medium text-text-secondary">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Drogaria Sao Paulo"
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Phone Number *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 5511999999999"
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Sao Paulo"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">State</label>
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="e.g. SP"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" disabled={create.isPending || !name || !phone}>
              <Building2 className="h-3.5 w-3.5" />
              {create.isPending ? 'Adding...' : 'Add Pharmacy'}
            </Button>
          </div>
          {create.isError && (
            <p className="col-span-2 text-sm text-red-500">{(create.error as Error).message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
