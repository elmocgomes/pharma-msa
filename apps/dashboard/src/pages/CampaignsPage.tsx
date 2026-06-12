import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Script, type Session, type Pharmacy, type Product } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { Megaphone, Play, Pause, BarChart3, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function CampaignReport({ campaignId }: { campaignId: string }) {
  const { data: report, isLoading, error } = useQuery({
    queryKey: ['report', campaignId],
    queryFn: () => api.reports.get(campaignId),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.reports.generate(campaignId),
  });

  if (isLoading) return <div className="text-sm text-text-tertiary px-6 py-3">Loading report...</div>;

  if (error || !report) {
    return (
      <div className="px-6 py-4 border-t border-border">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-tertiary">No report generated yet.</p>
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {generateMutation.isPending ? 'Queuing...' : generateMutation.isSuccess ? 'Queued' : 'Generate Report'}
          </Button>
        </div>
      </div>
    );
  }

  const r = report.report;
  const s = r.summary;

  return (
    <div className="px-6 py-4 border-t border-border space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Campaign Report</h3>
        <span className="text-xs text-text-tertiary">
          Generated: {new Date(r.generated_at).toLocaleString()}
        </span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-surface-raised rounded-lg p-3">
          <div className="text-xs text-text-tertiary">Pharmacies Contacted</div>
          <div className="text-lg font-semibold">{r.total_pharmacies_contacted}</div>
        </div>
        <div className="bg-surface-raised rounded-lg p-3">
          <div className="text-xs text-text-tertiary">Responded</div>
          <div className="text-lg font-semibold">{r.total_pharmacies_responded}</div>
        </div>
        <div className="bg-surface-raised rounded-lg p-3">
          <div className="text-xs text-text-tertiary">Availability Rate</div>
          <div className="text-lg font-semibold">{(s.reference_availability_rate * 100).toFixed(0)}%</div>
        </div>
        <div className="bg-surface-raised rounded-lg p-3">
          <div className="text-xs text-text-tertiary">Avg Price</div>
          <div className="text-lg font-semibold">
            {s.reference_avg_price != null ? `R$ ${s.reference_avg_price.toFixed(2)}` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Generics & Similars */}
      {(s.generics_found.length > 0 || s.similares_found.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {s.similares_found.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-text-secondary mb-2">Similares Found</h4>
              <div className="space-y-1">
                {s.similares_found.map((p, i) => (
                  <div key={i} className="text-xs bg-surface-raised rounded px-2 py-1.5 flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-text-tertiary">
                      {p.avg_price != null ? `R$ ${p.avg_price.toFixed(2)}` : '-'} | {p.pharmacies_offering} pharm.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {s.generics_found.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-text-secondary mb-2">Generics Found</h4>
              <div className="space-y-1">
                {s.generics_found.map((p, i) => (
                  <div key={i} className="text-xs bg-surface-raised rounded px-2 py-1.5 flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-text-tertiary">
                      {p.avg_price != null ? `R$ ${p.avg_price.toFixed(2)}` : '-'} | {p.pharmacies_offering} pharm.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Insights & Recommendations */}
      {r.insights.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-1">Insights</h4>
          <ul className="text-xs text-text-secondary space-y-0.5 list-disc list-inside">
            {r.insights.map((insight, i) => <li key={i}>{insight}</li>)}
          </ul>
        </div>
      )}
      {r.recommendations.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-1">Recommendations</h4>
          <ul className="text-xs text-text-secondary space-y-0.5 list-disc list-inside">
            {r.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CampaignsPage() {
  const qc = useQueryClient();
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: api.campaigns.list });

  const start = useMutation({
    mutationFn: (id: string) => api.campaigns.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const pause = useMutation({
    mutationFn: (id: string) => api.campaigns.pause(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  function toggleReport(id: string) {
    setExpandedCampaignId(prev => prev === id ? null : id);
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Campaigns</h1>
          <p className="text-sm text-text-secondary mt-0.5">Manage mystery shopper campaigns</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Campaign
        </Button>
      </div>

      {showCreate && <CreateCampaignForm onClose={() => setShowCreate(false)} />}

      {campaigns.data?.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No campaigns"
          description="Create a campaign to start mystery shopping pharmacies"
          action={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> New Campaign</Button>}
        />
      ) : (
        <div className="space-y-3">
          {campaigns.data?.map((campaign) => (
            <Card key={campaign.id}>
              <div className="flex items-center gap-4 px-6 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-dim text-brand">
                  <Megaphone className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{campaign.name}</span>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <p className="text-xs text-text-tertiary font-mono mt-0.5">{campaign.id.slice(0, 12)}</p>
                </div>
                <span className="text-xs text-text-tertiary">
                  {formatDistanceToNow(new Date(campaign.updatedAt), { addSuffix: true })}
                </span>
                {campaign.status === 'draft' && (
                  <Button size="sm" onClick={() => start.mutate(campaign.id)} disabled={start.isPending}>
                    <Play className="h-3.5 w-3.5" />
                    Start
                  </Button>
                )}
                {campaign.status === 'running' && (
                  <Button size="sm" variant="secondary" onClick={() => pause.mutate(campaign.id)} disabled={pause.isPending}>
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </Button>
                )}
                {(campaign.status === 'completed' || campaign.status === 'running') && (
                  <Button size="sm" variant="ghost" onClick={() => toggleReport(campaign.id)}>
                    <BarChart3 className="h-3.5 w-3.5" />
                    Report
                    {expandedCampaignId === campaign.id
                      ? <ChevronUp className="h-3 w-3" />
                      : <ChevronDown className="h-3 w-3" />}
                  </Button>
                )}
              </div>
              {expandedCampaignId === campaign.id && (
                <CampaignReport campaignId={campaign.id} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateCampaignForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scriptId, setScriptId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [selectedPharmacies, setSelectedPharmacies] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });
  const scripts = useQuery({ queryKey: ['scripts'], queryFn: api.scripts.list });
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: api.pharmacies.list });
  const products = useQuery({ queryKey: ['products'], queryFn: api.products.list });

  const create = useMutation({
    mutationFn: (data: { name: string; scriptId: string; waSessionId: string; pharmacyIds: string[]; productIds: string[] }) =>
      api.campaigns.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
  });

  function toggleItem(id: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  }

  const canSubmit = name && scriptId && sessionId && selectedPharmacies.length > 0 && selectedProducts.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Campaign</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            create.mutate({
              name,
              scriptId,
              waSessionId: sessionId,
              pharmacyIds: selectedPharmacies,
              productIds: selectedProducts,
            });
          }}
          className="space-y-4"
        >
          {/* Basic info row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary">Campaign Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SP Survey Jun 2026"
                required
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">Script *</label>
              <select
                value={scriptId}
                onChange={(e) => setScriptId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand bg-surface"
              >
                <option value="">Select script...</option>
                {scripts.data?.map((s: Script) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">WhatsApp Session *</label>
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand bg-surface"
              >
                <option value="">Select session...</option>
                {sessions.data?.filter((s: Session) => s.status === 'connected').map((s: Session) => (
                  <option key={s.id} value={s.id}>{s.personaName ?? s.name} ({s.phoneNumber ?? 'no phone'})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pharmacies selection */}
          <div>
            <label className="text-xs font-medium text-text-secondary">
              Pharmacies * ({selectedPharmacies.length} selected)
            </label>
            <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border-dim">
              {pharmacies.data?.length === 0 ? (
                <p className="text-xs text-text-tertiary px-3 py-2">No pharmacies yet. Add some first.</p>
              ) : (
                pharmacies.data?.map((ph: Pharmacy) => (
                  <label key={ph.id} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPharmacies.includes(ph.id)}
                      onChange={() => toggleItem(ph.id, selectedPharmacies, setSelectedPharmacies)}
                      className="rounded border-border"
                    />
                    <span className="text-sm flex-1">{ph.name}</span>
                    <span className="text-xs text-text-tertiary">{ph.phoneNumber}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Products selection */}
          <div>
            <label className="text-xs font-medium text-text-secondary">
              Products * ({selectedProducts.length} selected)
            </label>
            <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border-dim">
              {products.data?.length === 0 ? (
                <p className="text-xs text-text-tertiary px-3 py-2">No products yet. Add some first.</p>
              ) : (
                products.data?.map((p: Product) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(p.id)}
                      onChange={() => toggleItem(p.id, selectedProducts, setSelectedProducts)}
                      className="rounded border-border"
                    />
                    <span className="text-sm flex-1">{p.name}</span>
                    <span className="text-xs text-text-tertiary">{p.brand ?? '-'}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending || !canSubmit}>
              <Megaphone className="h-3.5 w-3.5" />
              {create.isPending ? 'Creating...' : 'Create Campaign'}
            </Button>
          </div>
          {create.isError && (
            <p className="text-sm text-red-500">{(create.error as Error).message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
