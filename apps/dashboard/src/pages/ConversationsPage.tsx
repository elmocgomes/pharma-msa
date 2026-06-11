import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { MessageSquare, ArrowUpDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function ConversationsPage() {
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => api.conversations.list() });
  const navigate = useNavigate();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Conversations</h1>
        <p className="text-sm text-text-secondary mt-0.5">All mystery shopper conversations</p>
      </div>

      {conversations.data?.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" />}
          title="No conversations yet"
          description="Start a campaign to begin conversations with pharmacies"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_120px_80px_80px_100px] gap-4 px-6 py-3 bg-surface-dim border-b border-border-dim text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
            <span className="flex items-center gap-1">Product <ArrowUpDown className="h-3 w-3" /></span>
            <span>Status</span>
            <span>Node</span>
            <span>Version</span>
            <span>Messages</span>
            <span>Updated</span>
          </div>
          {/* Rows */}
          <div className="divide-y divide-border-dim">
            {conversations.data?.map((conv) => (
              <button
                key={conv.id}
                onClick={() => navigate(`/conversations/${conv.id}`)}
                className="grid grid-cols-[1fr_120px_120px_80px_80px_100px] gap-4 px-6 py-3 w-full text-left hover:bg-surface-hover transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{conv.variables?.product_name ?? '-'}</p>
                  <p className="text-xs text-text-tertiary font-mono truncate">{conv.id.slice(0, 12)}</p>
                </div>
                <div className="flex items-center">
                  <StatusBadge status={conv.status} />
                </div>
                <span className="text-xs text-text-secondary font-mono self-center truncate">{conv.currentNodeId ?? '-'}</span>
                <span className="text-xs text-text-secondary tabular-nums self-center">v{conv.version}</span>
                <span className="text-xs text-text-secondary tabular-nums self-center">
                  {conv.nodeVisitCount}
                </span>
                <span className="text-xs text-text-tertiary self-center">
                  {conv.updatedAt ? formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true }) : '-'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
