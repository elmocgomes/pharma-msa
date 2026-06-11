import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { Megaphone, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function CampaignsPage() {
  const qc = useQueryClient();
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: api.campaigns.list });

  const start = useMutation({
    mutationFn: (id: string) => api.campaigns.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
