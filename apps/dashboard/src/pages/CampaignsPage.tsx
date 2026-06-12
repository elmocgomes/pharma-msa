import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Script, type Session, type Pharmacy, type AnvisaProduct } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { Megaphone, Play, Pause, BarChart3, ChevronDown, ChevronUp, Plus, Globe, MapPin, Search, X, Users, Pill, Trash2 } from 'lucide-react';
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

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => api.campaigns.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const deleteGroup = useMutation({
    mutationFn: (id: string) => api.campaignGroups.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign-groups'] });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
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
                    {campaign.status !== 'running' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        disabled={deleteCampaign.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete campaign "${campaign.name}"? This will remove all conversations, messages, and reports.`)) {
                            deleteCampaign.mutate(campaign.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
                <CampaignGroupCard key={group.id} group={group} onDelete={deleteGroup} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function sortCompetitors(list: AnvisaProduct[], main: AnvisaProduct | null): AnvisaProduct[] {
  if (!main) return list;
  return [...list].sort((a, b) => {
    // Score: 0 = same dosage+form, 1 = same dosage only, 2 = same form only, 3 = different
    const scoreOf = (p: AnvisaProduct) => {
      const sameDosagem = p.dosagem && main.dosagem && p.dosagem === main.dosagem;
      const sameForma = p.forma && main.forma && p.forma === main.forma;
      if (sameDosagem && sameForma) return 0;
      if (sameDosagem) return 1;
      if (sameForma) return 2;
      return 3;
    };
    const diff = scoreOf(a) - scoreOf(b);
    if (diff !== 0) return diff;
    return a.produto.localeCompare(b.produto);
  });
}

function competitorMatchLevel(product: AnvisaProduct, main: AnvisaProduct): 'exact' | 'dosage' | 'other' {
  const sameDosagem = product.dosagem && main.dosagem && product.dosagem === main.dosagem;
  const sameForma = product.forma && main.forma && product.forma === main.forma;
  if (sameDosagem && sameForma) return 'exact';
  if (sameDosagem) return 'dosage';
  return 'other';
}

function CompetitorRow({ product, onAdd }: { product: AnvisaProduct; onAdd: (p: AnvisaProduct) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-purple-100/50"
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{product.produto}</span>
        <div className="flex gap-1.5 mt-0.5">
          {product.dosagem && <span className="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">{product.dosagem}</span>}
          {product.forma && <span className="text-[10px] bg-gray-50 text-gray-500 px-1 py-0.5 rounded">{product.forma}</span>}
          {product.quantidade && <span className="text-[10px] bg-gray-50 text-gray-500 px-1 py-0.5 rounded">x{product.quantidade}</span>}
        </div>
      </div>
      <span className="text-[11px] text-text-tertiary shrink-0">{product.laboratorio ?? '—'}</span>
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
        product.tipoProduto === 'Genérico' ? 'bg-green-50 text-green-700' :
        product.tipoProduto === 'Similar' ? 'bg-amber-50 text-amber-700' :
        'bg-blue-50 text-blue-700'
      }`}>
        {product.tipoProduto}
      </span>
    </button>
  );
}

function CreateCampaignForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scriptId, setScriptId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [selectedPharmacies, setSelectedPharmacies] = useState<string[]>([]);
  const [mainProduct, setMainProduct] = useState<AnvisaProduct | null>(null);
  const [selectedCompetitors, setSelectedCompetitors] = useState<AnvisaProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showCompetitors, setShowCompetitors] = useState(true);

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });
  const scripts = useQuery({ queryKey: ['scripts'], queryFn: api.scripts.list });
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: api.pharmacies.list });
  const anvisaResults = useQuery({
    queryKey: ['anvisa-campaign-search', productSearchQuery],
    queryFn: () => api.anvisa.search({ q: productSearchQuery, limit: 10 }),
    enabled: productSearchQuery.length > 0,
  });

  const competitors = useQuery({
    queryKey: ['anvisa-competitors', mainProduct?.substancia],
    queryFn: () => api.anvisa.bySubstance(mainProduct!.substancia),
    enabled: !!mainProduct?.substancia,
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

  function selectMainProduct(p: AnvisaProduct) {
    setMainProduct(p);
    setSelectedCompetitors([]);
    setProductSearch('');
    setProductSearchQuery('');
  }

  function addCompetitor(p: AnvisaProduct) {
    if (!selectedCompetitors.find((s) => s.id === p.id)) {
      setSelectedCompetitors((prev) => [...prev, p]);
    }
  }

  function removeCompetitor(id: string) {
    setSelectedCompetitors((prev) => prev.filter((p) => p.id !== id));
  }

  function clearMainProduct() {
    setMainProduct(null);
    setSelectedCompetitors([]);
  }

  const canSubmit = name && scriptId && sessionId && selectedPharmacies.length > 0 && mainProduct;

  const allIds = selectedCompetitors.map((c) => c.id);
  if (mainProduct) allIds.unshift(mainProduct.id);

  const competitorList = sortCompetitors(
    (competitors.data?.products ?? []).filter(
      (c) => c.id !== mainProduct?.id && !selectedCompetitors.some((s) => s.id === c.id),
    ),
    mainProduct,
  );

  const exactCount = mainProduct ? competitorList.filter((c) => competitorMatchLevel(c, mainProduct) === 'exact').length : 0;
  const dosageCount = mainProduct ? competitorList.filter((c) => competitorMatchLevel(c, mainProduct) === 'dosage').length : 0;

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
              anvisaProductIds: allIds,
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

          {/* Main product — the product being surveyed */}
          <div>
            <label className="text-xs font-medium text-text-secondary">Product to Survey *</label>

            {mainProduct ? (
              <div className="mt-1 rounded-lg border-2 border-brand bg-brand/5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand">{mainProduct.produto}</p>
                    <div className="flex gap-2 mt-0.5">
                      {mainProduct.dosagem && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{mainProduct.dosagem}</span>}
                      {mainProduct.forma && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{mainProduct.forma}</span>}
                      {mainProduct.quantidade && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">x{mainProduct.quantidade}</span>}
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-0.5">{mainProduct.substancia} · {mainProduct.laboratorio ?? '—'} · {mainProduct.tipoProduto}</p>
                  </div>
                  <button type="button" onClick={clearMainProduct} className="text-text-tertiary hover:text-red-500 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-text-tertiary" />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setProductSearchQuery(productSearch); } }}
                      placeholder="Search the product you want to survey..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border text-sm focus:outline-brand focus:border-brand"
                    />
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setProductSearchQuery(productSearch)}>
                    Search
                  </Button>
                </div>

                {productSearchQuery && anvisaResults.data && (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border-dim">
                    {anvisaResults.data.data.length === 0 ? (
                      <p className="text-xs text-text-tertiary px-3 py-2">No products found</p>
                    ) : (
                      anvisaResults.data.data.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectMainProduct(p)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-hover cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{p.produto}</span>
                            <div className="flex gap-1.5 mt-0.5">
                              {p.dosagem && <span className="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">{p.dosagem}</span>}
                              {p.forma && <span className="text-[10px] bg-gray-50 text-gray-500 px-1 py-0.5 rounded">{p.forma}</span>}
                              {p.quantidade && <span className="text-[10px] bg-gray-50 text-gray-500 px-1 py-0.5 rounded">x{p.quantidade}</span>}
                            </div>
                          </div>
                          <span className="text-[11px] text-text-tertiary shrink-0">{p.laboratorio ?? '—'}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                            p.tipoProduto === 'Genérico' ? 'bg-green-50 text-green-700' :
                            p.tipoProduto === 'Similar' ? 'bg-amber-50 text-amber-700' :
                            'bg-blue-50 text-blue-700'
                          }`}>
                            {p.tipoProduto}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Competitors — same substance, shown after main product is selected */}
          {mainProduct && (
            <div>
              <label className="text-xs font-medium text-text-secondary">
                Competitors ({selectedCompetitors.length} selected)
              </label>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                Same substance: {mainProduct.substancia}. Select competitors to also inquire about.
              </p>

              {/* Selected competitor chips */}
              {selectedCompetitors.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedCompetitors.map((p) => (
                    <span key={p.id} className="flex items-center gap-1 bg-purple-100 text-purple-700 text-xs font-medium px-2 py-1 rounded-lg max-w-xs">
                      <span className="truncate">{p.produto}</span>
                      <span className="text-purple-400 shrink-0">· {p.dosagem ?? p.apresentacao}</span>
                      <button type="button" onClick={() => removeCompetitor(p.id)} className="hover:text-red-500 shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Competitors list */}
              {competitorList.length > 0 && (
                <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50/50">
                  <button
                    type="button"
                    onClick={() => setShowCompetitors(!showCompetitors)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  >
                    <Users className="h-3.5 w-3.5 text-purple-600" />
                    <span className="text-xs font-medium text-purple-700 flex-1">
                      Available competitors — {competitorList.length} products
                      {exactCount > 0 && ` (${exactCount} same dosage+form)`}
                      {dosageCount > 0 && ` (${dosageCount} same dosage)`}
                    </span>
                    {showCompetitors
                      ? <ChevronUp className="h-3.5 w-3.5 text-purple-400" />
                      : <ChevronDown className="h-3.5 w-3.5 text-purple-400" />}
                  </button>
                  {showCompetitors && (
                    <div className="max-h-48 overflow-y-auto border-t border-purple-200">
                      {competitorList.map((c, i) => {
                        const level = mainProduct ? competitorMatchLevel(c, mainProduct) : 'other';
                        const prevLevel = i > 0 && mainProduct ? competitorMatchLevel(competitorList[i - 1], mainProduct) : null;
                        const showHeader = i === 0 || level !== prevLevel;
                        return (
                          <div key={c.id}>
                            {showHeader && (
                              <div className={`px-3 py-1 text-[10px] font-medium uppercase tracking-wider ${
                                level === 'exact' ? 'bg-purple-100/60 text-purple-600' :
                                level === 'dosage' ? 'bg-blue-50 text-blue-500' :
                                'bg-gray-50 text-gray-400'
                              } ${i > 0 ? 'border-t border-purple-200' : ''}`}>
                                {level === 'exact' ? 'Same dosage & form' :
                                 level === 'dosage' ? 'Same dosage, different form' :
                                 'Other presentations'}
                              </div>
                            )}
                            <div className="border-t border-purple-100">
                              <CompetitorRow product={c} onAdd={addCompetitor} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {competitors.isLoading && (
                <p className="text-xs text-text-tertiary mt-2">Loading competitors...</p>
              )}
            </div>
          )}

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

function CampaignGroupCard({ group, onDelete }: { group: import('@/lib/api').CampaignGroup; onDelete: { mutate: (id: string) => void; isPending: boolean } }) {
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
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
          disabled={onDelete.isPending}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete group "${group.name}"? Child campaigns will be unlinked but not deleted.`)) {
              onDelete.mutate(group.id);
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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
  const [mainProduct, setMainProduct] = useState<AnvisaProduct | null>(null);
  const [selectedCompetitors, setSelectedCompetitors] = useState<AnvisaProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);
  const [showCompetitors, setShowCompetitors] = useState(true);

  const scripts = useQuery({ queryKey: ['scripts'], queryFn: api.scripts.list });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });

  const anvisaResults = useQuery({
    queryKey: ['anvisa-group-search', productSearch],
    queryFn: () => api.anvisa.search({ q: productSearch, limit: 10 }),
    enabled: productSearch.length >= 2,
  });

  const competitors = useQuery({
    queryKey: ['anvisa-competitors-group', mainProduct?.substancia],
    queryFn: () => api.anvisa.bySubstance(mainProduct!.substancia),
    enabled: !!mainProduct?.substancia,
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

  function selectMainProduct(p: AnvisaProduct) {
    setMainProduct(p);
    setSelectedCompetitors([]);
    setProductSearch('');
    setShowProductResults(false);
  }

  function addCompetitor(p: AnvisaProduct) {
    if (!selectedCompetitors.find((s) => s.id === p.id)) {
      setSelectedCompetitors((prev) => [...prev, p]);
    }
  }

  function removeCompetitor(id: string) {
    setSelectedCompetitors((prev) => prev.filter((p) => p.id !== id));
  }

  function clearMainProduct() {
    setMainProduct(null);
    setSelectedCompetitors([]);
  }

  const canSubmit = name && scriptId && selectedStates.length > 0 && mainProduct;

  const allIds = selectedCompetitors.map((c) => c.id);
  if (mainProduct) allIds.unshift(mainProduct.id);

  // Check if all selected states have sessions
  const statesWithoutSession = selectedStates.filter((st) => !statesWithSessions.has(st));

  const competitorList = sortCompetitors(
    (competitors.data?.products ?? []).filter(
      (c) => c.id !== mainProduct?.id && !selectedCompetitors.some((s) => s.id === c.id),
    ),
    mainProduct,
  );

  const exactCount = mainProduct ? competitorList.filter((c) => competitorMatchLevel(c, mainProduct) === 'exact').length : 0;
  const dosageCount = mainProduct ? competitorList.filter((c) => competitorMatchLevel(c, mainProduct) === 'dosage').length : 0;

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
              anvisaProductIds: allIds,
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

          {/* Main product — the product being surveyed */}
          <div>
            <label className="text-xs font-medium text-text-secondary">Product to Survey *</label>

            {mainProduct ? (
              <div className="mt-1 rounded-lg border-2 border-brand bg-brand/5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand">{mainProduct.produto}</p>
                    <div className="flex gap-2 mt-0.5">
                      {mainProduct.dosagem && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{mainProduct.dosagem}</span>}
                      {mainProduct.forma && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{mainProduct.forma}</span>}
                      {mainProduct.quantidade && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">x{mainProduct.quantidade}</span>}
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-0.5">{mainProduct.substancia} · {mainProduct.laboratorio ?? '—'} · {mainProduct.tipoProduto}</p>
                  </div>
                  <button type="button" onClick={clearMainProduct} className="text-text-tertiary hover:text-red-500 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-tertiary" />
                  <input
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductResults(true);
                    }}
                    onFocus={() => productSearch.length >= 2 && setShowProductResults(true)}
                    placeholder="Search the product you want to survey..."
                    className="w-full rounded-lg border border-border pl-8 pr-3 py-2 text-sm focus:outline-brand focus:border-brand"
                  />

                  {showProductResults && productSearch.length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg divide-y divide-border-dim">
                      {anvisaResults.isLoading ? (
                        <p className="text-xs text-text-tertiary px-3 py-2">Searching...</p>
                      ) : anvisaResults.data?.data.length === 0 ? (
                        <p className="text-xs text-text-tertiary px-3 py-2">No results found</p>
                      ) : (
                        anvisaResults.data?.data.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => selectMainProduct(r)}
                            className="w-full text-left px-3 py-2 hover:bg-surface-hover"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium flex-1">{r.produto}</span>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                                r.tipoProduto === 'Genérico' ? 'bg-green-50 text-green-700' :
                                r.tipoProduto === 'Similar' ? 'bg-amber-50 text-amber-700' :
                                'bg-blue-50 text-blue-700'
                              }`}>
                                {r.tipoProduto}
                              </span>
                            </div>
                            <p className="text-[11px] text-text-tertiary truncate">{r.apresentacao}</p>
                            <p className="text-[11px] text-text-tertiary">
                              {r.substancia} · {r.laboratorio ?? '—'}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Competitors — same substance, shown after main product is selected */}
          {mainProduct && (
            <div>
              <label className="text-xs font-medium text-text-secondary">
                Competitors ({selectedCompetitors.length} selected)
              </label>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                Same substance: {mainProduct.substancia}. Select competitors to also inquire about.
              </p>

              {/* Selected competitor chips */}
              {selectedCompetitors.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedCompetitors.map((p) => (
                    <span key={p.id} className="flex items-center gap-1 bg-purple-100 text-purple-700 text-xs font-medium px-2 py-1 rounded-lg max-w-xs">
                      <span className="truncate">{p.produto}</span>
                      <span className="text-purple-400 shrink-0">· {p.dosagem ?? p.apresentacao}</span>
                      <button type="button" onClick={() => removeCompetitor(p.id)} className="hover:text-red-500 shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Competitors list */}
              {competitorList.length > 0 && (
                <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50/50">
                  <button
                    type="button"
                    onClick={() => setShowCompetitors(!showCompetitors)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  >
                    <Users className="h-3.5 w-3.5 text-purple-600" />
                    <span className="text-xs font-medium text-purple-700 flex-1">
                      Available competitors — {competitorList.length} products
                      {exactCount > 0 && ` (${exactCount} same dosage+form)`}
                      {dosageCount > 0 && ` (${dosageCount} same dosage)`}
                    </span>
                    {showCompetitors
                      ? <ChevronUp className="h-3.5 w-3.5 text-purple-400" />
                      : <ChevronDown className="h-3.5 w-3.5 text-purple-400" />}
                  </button>
                  {showCompetitors && (
                    <div className="max-h-48 overflow-y-auto border-t border-purple-200">
                      {competitorList.map((c, i) => {
                        const level = mainProduct ? competitorMatchLevel(c, mainProduct) : 'other';
                        const prevLevel = i > 0 && mainProduct ? competitorMatchLevel(competitorList[i - 1], mainProduct) : null;
                        const showHeader = i === 0 || level !== prevLevel;
                        return (
                          <div key={c.id}>
                            {showHeader && (
                              <div className={`px-3 py-1 text-[10px] font-medium uppercase tracking-wider ${
                                level === 'exact' ? 'bg-purple-100/60 text-purple-600' :
                                level === 'dosage' ? 'bg-blue-50 text-blue-500' :
                                'bg-gray-50 text-gray-400'
                              } ${i > 0 ? 'border-t border-purple-200' : ''}`}>
                                {level === 'exact' ? 'Same dosage & form' :
                                 level === 'dosage' ? 'Same dosage, different form' :
                                 'Other presentations'}
                              </div>
                            )}
                            <div className="border-t border-purple-100">
                              <CompetitorRow product={c} onAdd={addCompetitor} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {competitors.isLoading && (
                <p className="text-xs text-text-tertiary mt-2">Loading competitors...</p>
              )}
            </div>
          )}

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
