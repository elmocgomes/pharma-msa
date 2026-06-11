import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Smartphone, MessageSquare, Megaphone, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function OverviewPage() {
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: api.campaigns.list });
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => api.conversations.list() });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30000 });

  const connectedSessions = sessions.data?.filter(s => s.status === 'connected').length ?? 0;
  const totalSessions = sessions.data?.length ?? 0;
  const completedConvos = conversations.data?.filter(c => c.status === 'completed').length ?? 0;
  const activeConvos = conversations.data?.filter(c =>
    ['greeting', 'in_progress', 'waiting_response', 'recovery'].includes(c.status),
  ).length ?? 0;
  const errorConvos = conversations.data?.filter(c => ['error', 'failed', 'timeout'].includes(c.status)).length ?? 0;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Overview</h1>
          <p className="text-sm text-text-secondary mt-0.5">System health and key metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${health.data ? 'bg-success' : 'bg-danger'}`} />
          <span className="text-xs text-text-secondary">
            API {health.data ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Sessions"
          value={`${connectedSessions}/${totalSessions}`}
          sub="connected"
          icon={<Smartphone className="h-5 w-5" />}
        />
        <MetricCard
          label="Campaigns"
          value={campaigns.data?.length ?? 0}
          sub={`${campaigns.data?.filter(c => c.status === 'running').length ?? 0} running`}
          icon={<Megaphone className="h-5 w-5" />}
        />
        <MetricCard
          label="Completed"
          value={completedConvos}
          sub="conversations"
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <MetricCard
          label="Active"
          value={activeConvos}
          sub={errorConvos > 0 ? `${errorConvos} errors` : 'in progress'}
          icon={<MessageSquare className="h-5 w-5" />}
        />
      </div>

      {/* Recent conversations */}
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="px-6 py-4 border-b border-border-dim">
          <h2 className="text-sm font-semibold">Recent Conversations</h2>
        </div>
        <div className="divide-y divide-border-dim">
          {conversations.data?.slice(0, 10).map((conv) => (
            <a
              key={conv.id}
              href={`/conversations/${conv.id}`}
              className="flex items-center gap-4 px-6 py-3 hover:bg-surface-hover transition-colors"
            >
              <StatusBadge status={conv.status} />
              <span className="text-sm text-text font-medium truncate flex-1">
                {conv.variables?.product_name ?? 'Unknown product'}
              </span>
              <span className="text-xs text-text-tertiary tabular-nums">
                Node: {conv.currentNodeId ?? '-'}
              </span>
              <span className="text-xs text-text-tertiary tabular-nums">
                v{conv.version}
              </span>
              {conv.updatedAt && (
                <span className="text-xs text-text-tertiary w-24 text-right">
                  {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                </span>
              )}
            </a>
          ))}
          {conversations.data?.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-text-tertiary">
              <Clock className="h-4 w-4 mr-2" />
              No conversations yet
            </div>
          )}
        </div>
      </div>

      {/* Errors */}
      {errorConvos > 0 && (
        <div className="rounded-xl border border-danger/20 bg-danger-dim shadow-sm">
          <div className="px-6 py-4 border-b border-danger/10">
            <h2 className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Errors ({errorConvos})
            </h2>
          </div>
          <div className="divide-y divide-danger/10">
            {conversations.data
              ?.filter(c => ['error', 'failed', 'timeout'].includes(c.status))
              .slice(0, 5)
              .map((conv) => (
                <div key={conv.id} className="px-6 py-3 flex items-center gap-4">
                  <StatusBadge status={conv.status} />
                  <span className="text-sm text-red-800 truncate flex-1">
                    {conv.errorReason ?? 'No reason provided'}
                  </span>
                  <span className="text-xs text-red-600 font-mono">{conv.id.slice(0, 8)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
