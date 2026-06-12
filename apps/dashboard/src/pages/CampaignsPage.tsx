import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Script, type Session, type Pharmacy, type AnvisaProduct } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { Megaphone, Play, Pause, BarChart3, ChevronDown, ChevronUp, Plus, Globe, MapPin, Search, X } from 'lucide-react';
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
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [tab, setTab] = useState<'campaigns' | 'groups'>('campaigns');
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: api.campaigns.list });
  const campaignGroups = useQuery({ queryKey: ['campaign-groups'], queryFn: api.campaignGroups.list });

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
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowCreateGroup(true)}>
            <Globe className="h-3.5 w-3.5" />
            Multi-State Group
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('campaigns')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'campaigns'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Campaigns ({campaigns.data?.length ?? 0})
        </button>
        <button
          onClick={() => setTab('groups')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'groups'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Campaign Groups ({campaignGroups.data?.length ?? 0})
        </button>
      </div>

      {showCreate && <CreateCampaignForm onClose={() => setShowCreate(false)} />}
      {showCreateGroup && <CreateCampaignGroupForm onClose={() => setShowCreateGroup(false)} />}

      {tab === 'campaigns' && (
        <>
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
        </>
      )}

      {tab === 'groups' && (
        <>
          {campaignGroups.data?.length === 0 ? (
            <EmptyState
              icon={<Globe className="h-10 w-10" />}
              title="No campaign groups"
              description="Create a multi-state campaign group to deploy across multiple states simultaneously"
              action={<Button size="sm" onClick={() => setShowCreateGroup(true)}><Globe className="h-3.5 w-3.5" /> New Group</Button>}
            />
          ) : (
            <div className="space-y-3">
              {campaignGroups.data?.map((group) => (
                <CampaignGroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
        </>
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
  const [selectedAnvisaProducts, setSelectedAnvisaProducts] = useState<AnvisaProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });
  const scripts = useQuery({ queryKey: ['scripts'], queryFn: api.scripts.list });
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: api.pharmacies.list });
  const anvisaResults = useQuery({
    queryKey: ['anvisa-campaign-search', productSearchQuery],
    queryFn: () => api.anvisa.search({ q: productSearchQuery, limit: 10 }),
    enabled: productSearchQuery.length > 0,
  });

  const create = useMutation({
    mutationFn: (data: { name: string; scriptId: string; waSessionId: string; pharmacyIds: string[]; anvisaProductIds: string[] }) =>
      api.campaigns.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
  });

  function togglePharmacy(id: string) {
    setSelectedPharmacies((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function addProduct(p: AnvisaProduct) {
    if (!selectedAnvisaProducts.find((s) => s.id === p.id)) {
      setSelectedAnvisaProducts((prev) => [...prev, p]);
    }
  }

  function removeProduct(id: string) {
    setSelectedAnvisaProducts((prev) => prev.filter((p) => p.id !== id));
  }

  const canSubmit = name && scriptId && sessionId && selectedPharmacies.length > 0 && selectedAnvisaProducts.length > 0;

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
              anvisaProductIds: selectedAnvisaProducts.map((p) => p.id),
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
                      onChange={() => togglePharmacy(ph.id)}
                      className="rounded border-border"
                    />
                    <span className="text-sm flex-1">{ph.name}</span>
                    <span className="text-xs text-text-tertiary">{ph.phoneNumber}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Products selection — search Anvisa catalog */}
          <div>
            <label className="text-xs font-medium text-text-secondary">
              Products * ({selectedAnvisaProducts.length} selected)
            </label>

            {/* Selected products chips */}
            {selectedAnvisaProducts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                {selectedAnvisaProducts.map((p) => (
                  <span key={p.id} className="flex items-center gap-1 bg-brand-dim text-brand text-xs font-medium px-2 py-1 rounded-lg">
                    {p.produto}
                    <button type="button" onClick={() => removeProduct(p.id)} className="hover:text-brand/70">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-text-tertiary" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setProductSearchQuery(productSearch); } }}
                  placeholder="Search product name or active ingredient..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border text-sm focus:outline-brand focus:border-brand"
                />
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setProductSearchQuery(productSearch)}>
                Search
              </Button>
            </div>

            {/* Search results */}
            {productSearchQuery && anvisaResults.data && (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border-dim">
                {anvisaResults.data.data.length === 0 ? (
                  <p className="text-xs text-text-tertiary px-3 py-2">No products found</p>
                ) : (
                  anvisaResults.data.data.map((p) => {
                    const alreadySelected = selectedAnvisaProducts.some((s) => s.id === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={alreadySelected}
                        onClick={() => addProduct(p)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                          alreadySelected ? 'opacity-50 cursor-default' : 'hover:bg-surface-hover cursor-pointer'
                        }`}
                      >
                        <span className="flex-1 truncate">
                          <span className="font-medium">{p.produto}</span>
                          <span className="text-text-tertiary ml-1 text-xs">{p.substancia}</span>
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          p.tipoProduto === 'Genérico' ? 'bg-green-50 text-green-700' :
                          p.tipoProduto === 'Similar' ? 'bg-amber-50 text-amber-700' :
                          'bg-blue-50 text-blue-700'
                        }`}>
                          {p.tipoProduto}
                        </span>
                        {alreadySelected && <span className="text-[10px] text-text-tertiary">Added</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
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

const BRAZILIAN_STATES = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

function CampaignGroupCard({ group }: { group: import('@/lib/api').CampaignGroup }) {
  const [expanded, setExpanded] = useState(false);
  const detail = useQuery({
    queryKey: ['campaign-group', group.id],
    queryFn: () => api.campaignGroups.get(group.id),
    enabled: expanded,
  });

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
          <Globe className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{group.name}</span>
            <StatusBadge status={group.status} />
          </div>
          <div className="flex gap-1.5 mt-1">
            {group.targetStates.map((st) => (
              <span key={st} className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                {st}
              </span>
            ))}
          </div>
        </div>
        <span className="text-xs text-text-tertiary">
          {formatDistanceToNow(new Date(group.createdAt), { addSuffix: true })}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-text-tertiary" /> : <ChevronDown className="h-4 w-4 text-text-tertiary" />}
      </button>

      {expanded && detail.data && (
        <div className="px-6 py-4 border-t border-border space-y-3">
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Child Campaigns ({detail.data.campaigns.length})
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {detail.data.campaigns.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border-dim px-3 py-2">
                <MapPin className="h-3.5 w-3.5 text-text-tertiary" />
                <span className="text-sm font-medium flex-1">{c.name}</span>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function CreateCampaignGroupForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scriptId, setScriptId] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedAnvisaProducts, setSelectedAnvisaProducts] = useState<AnvisaProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);

  const scripts = useQuery({ queryKey: ['scripts'], queryFn: api.scripts.list });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });

  const anvisaResults = useQuery({
    queryKey: ['anvisa-search', productSearch],
    queryFn: () => api.anvisa.search({ q: productSearch, limit: 10 }),
    enabled: productSearch.length >= 2,
  });

  // Show which states have sessions assigned
  const statesWithSessions = new Set(
    (sessions.data ?? []).filter((s) => s.state && s.status === 'connected').map((s) => s.state!)
  );

  const create = useMutation({
    mutationFn: (data: { name: string; scriptId: string; anvisaProductIds: string[]; targetStates: string[] }) =>
      api.campaignGroups.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign-groups'] });
      onClose();
    },
  });

  function toggleState(st: string) {
    setSelectedStates((prev) => prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]);
  }

  function addAnvisaProduct(p: AnvisaProduct) {
    if (!selectedAnvisaProducts.find((s) => s.id === p.id)) {
      setSelectedAnvisaProducts((prev) => [...prev, p]);
    }
    setProductSearch('');
    setShowProductResults(false);
  }

  function removeAnvisaProduct(id: string) {
    setSelectedAnvisaProducts((prev) => prev.filter((p) => p.id !== id));
  }

  const canSubmit = name && scriptId && selectedStates.length > 0 && selectedAnvisaProducts.length > 0;

  // Check if all selected states have sessions
  const statesWithoutSession = selectedStates.filter((st) => !statesWithSessions.has(st));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          New Multi-State Campaign Group
        </CardTitle>
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
              anvisaProductIds: selectedAnvisaProducts.map((p) => p.id),
              targetStates: selectedStates,
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary">Group Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nationwide Survey Jun 2026"
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
                {scripts.data?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* State selection grid */}
          <div>
            <label className="text-xs font-medium text-text-secondary">
              Target States * ({selectedStates.length} selected)
            </label>
            <p className="text-[10px] text-text-tertiary mt-0.5 mb-2">
              Each state needs a WhatsApp session assigned to it. States with sessions are highlighted.
            </p>
            <div className="grid grid-cols-9 gap-1.5">
              {BRAZILIAN_STATES.map((st) => {
                const hasSession = statesWithSessions.has(st);
                const selected = selectedStates.includes(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleState(st)}
                    className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                      selected
                        ? 'bg-brand text-white border-brand'
                        : hasSession
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          : 'bg-surface text-text-tertiary border-border-dim hover:bg-surface-hover'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
            {statesWithoutSession.length > 0 && selectedStates.length > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                ⚠ States without assigned sessions: {statesWithoutSession.join(', ')}.
                Assign sessions to these states first in the Sessions page.
              </p>
            )}
          </div>

          {/* Products — Anvisa search */}
          <div>
            <label className="text-xs font-medium text-text-secondary">
              Products * ({selectedAnvisaProducts.length} selected)
            </label>

            {/* Selected product chips */}
            {selectedAnvisaProducts.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {selectedAnvisaProducts.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2.5 py-1 text-xs"
                  >
                    {p.produto}
                    <button type="button" onClick={() => removeAnvisaProduct(p.id)} className="hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative mt-1.5">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-tertiary" />
              <input
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowProductResults(true);
                }}
                onFocus={() => productSearch.length >= 2 && setShowProductResults(true)}
                placeholder="Search Anvisa catalog (name, substance, lab)..."
                className="w-full rounded-lg border border-border pl-8 pr-3 py-2 text-sm focus:outline-brand focus:border-brand"
              />

              {/* Dropdown results */}
              {showProductResults && productSearch.length >= 2 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg divide-y divide-border-dim">
                  {anvisaResults.isLoading ? (
                    <p className="text-xs text-text-tertiary px-3 py-2">Searching...</p>
                  ) : anvisaResults.data?.data.length === 0 ? (
                    <p className="text-xs text-text-tertiary px-3 py-2">No results found</p>
                  ) : (
                    anvisaResults.data?.data
                      .filter((r) => !selectedAnvisaProducts.find((s) => s.id === r.id))
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => addAnvisaProduct(r)}
                          className="w-full text-left px-3 py-2 hover:bg-surface-hover"
                        >
                          <p className="text-sm font-medium">{r.produto}</p>
                          <p className="text-[11px] text-text-tertiary">
                            {r.substancia} · {r.laboratorio ?? '—'} · {r.tipoProduto}
                          </p>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {statesWithoutSession.length > 0 && selectedStates.length > 0 && (
              <span className="text-xs text-amber-600 self-center">
                Will create campaigns only for states with sessions
              </span>
            )}
            <Button type="submit" disabled={create.isPending || !canSubmit}>
              <Globe className="h-3.5 w-3.5" />
              {create.isPending ? 'Creating...' : `Create Group (${selectedStates.length} states)`}
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
