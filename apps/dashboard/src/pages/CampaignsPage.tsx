import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { Megaphone, Play, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
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
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: api.campaigns.list });

  const start = useMutation({
    mutationFn: (id: string) => api.campaigns.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  function toggleReport(id: string) {
    setExpandedCampaignId(prev => prev === id ? null : id);
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <p className="text-sm text-text-secondary mt-0.5">Manage mystery shopper campaigns</p>
      </div>

      {campaigns.data?.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No campaigns"
          description="Create a campaign via the API to get started"
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
