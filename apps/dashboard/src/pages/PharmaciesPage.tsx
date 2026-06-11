import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty';
import { Building2, Phone, MapPin } from 'lucide-react';

export function PharmaciesPage() {
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: api.pharmacies.list });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pharmacies</h1>
        <p className="text-sm text-text-secondary mt-0.5">Target pharmacies for mystery shopping</p>
      </div>

      {pharmacies.data?.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="No pharmacies"
          description="Add pharmacies via the API"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_180px_150px_120px] gap-4 px-6 py-3 bg-surface-dim border-b border-border-dim text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
            <span>Name</span>
            <span>Phone</span>
            <span>Location</span>
            <span>Added</span>
          </div>
          <div className="divide-y divide-border-dim">
            {pharmacies.data?.map((ph) => (
              <div key={ph.id} className="grid grid-cols-[1fr_180px_150px_120px] gap-4 px-6 py-3 items-center">
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
