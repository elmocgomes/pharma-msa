import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { ArrowLeft, Bot, User, Package, Check, X, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => api.conversations.get(id!) });
  const msgs = useQuery({ queryKey: ['messages', id], queryFn: () => api.conversations.messages(id!) });
  const events = useQuery({ queryKey: ['events', id], queryFn: () => api.conversations.events(id!) });
  const extraction = useQuery({
    queryKey: ['extraction', id],
    queryFn: () => api.conversations.extraction(id!),
    retry: false,
  });

  if (!conv.data) {
    return <div className="p-8 text-text-secondary">Loading...</div>;
  }

  const c = conv.data;

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{c.variables?.product_name ?? 'Conversation'}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-xs text-text-tertiary font-mono mt-0.5">{c.id}</p>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex gap-6 text-sm">
        <InfoPill label="Node" value={c.currentNodeId ?? '-'} />
        <InfoPill label="Version" value={`v${c.version}`} />
        <InfoPill label="Visits" value={String(c.nodeVisitCount)} />
        <InfoPill label="Product #" value={String(c.productIndex + 1)} />
        <InfoPill label="Retries" value={String(c.retryCount)} />
        {c.errorReason && <InfoPill label="Error" value={c.errorReason} danger />}
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-6">
        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle>Messages ({msgs.data?.length ?? 0})</CardTitle>
          </CardHeader>
          <div className="px-4 py-4 space-y-3 max-h-[600px] overflow-auto">
            {msgs.data?.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.direction === 'outbound' ? '' : 'flex-row-reverse'}`}
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  msg.direction === 'outbound' ? 'bg-brand-dim text-brand' : 'bg-success-dim text-success'
                }`}>
                  {msg.direction === 'outbound' ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                </div>
                <div className={`max-w-[75%] ${msg.direction === 'outbound' ? '' : 'text-right'}`}>
                  <div className={`inline-block rounded-xl px-3.5 py-2 text-sm ${
                    msg.direction === 'outbound'
                      ? 'bg-brand text-white rounded-tl-sm'
                      : 'bg-gray-100 text-text rounded-tr-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-text-tertiary">
                    <span>{format(new Date(msg.createdAt), 'HH:mm:ss')}</span>
                    {msg.nodeId && <span className="font-mono">{msg.nodeId}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Extraction Results */}
          {extraction.data && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Extraction
                </CardTitle>
                <Badge variant={
                  extraction.data.rawAnalysis.conversation_quality === 'complete' ? 'success'
                    : extraction.data.rawAnalysis.conversation_quality === 'partial' ? 'warning'
                    : 'danger'
                }>
                  {extraction.data.rawAnalysis.conversation_quality}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {extraction.data.rawAnalysis.products.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border-dim p-3 space-y-2">
                    <p className="text-sm font-semibold">{p.product_name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        {p.is_available ? <Check className="h-3.5 w-3.5 text-success" /> : <X className="h-3.5 w-3.5 text-danger" />}
                        <span>{p.is_available ? 'Available' : 'Unavailable'}</span>
                      </div>
                      {p.price != null && (
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5 text-text-tertiary" />
                          <span className="font-semibold">R$ {p.price.toFixed(2)}</span>
                        </div>
                      )}
                      {p.has_generic && (
                        <div className="col-span-2">
                          <span className="text-text-secondary">Generic: </span>
                          {p.generic_names.map((g, j) => (
                            <span key={j}>
                              {g}{p.generic_prices[j] != null ? ` (R$${p.generic_prices[j]})` : ''}
                              {j < p.generic_names.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="text-xs text-text-tertiary">
                  Responsiveness: {extraction.data.rawAnalysis.pharmacy_responsiveness}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Variables */}
          <Card>
            <CardHeader><CardTitle>Variables</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-2 text-xs">
                {Object.entries(c.variables ?? {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-text-tertiary font-mono">{k}</dt>
                    <dd className="text-text font-medium text-right truncate">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {/* Events timeline */}
          <Card>
            <CardHeader><CardTitle>Events ({events.data?.length ?? 0})</CardTitle></CardHeader>
            <div className="px-6 py-3 max-h-80 overflow-auto space-y-2">
              {events.data?.map((evt) => (
                <div key={evt.id} className="flex gap-2.5 items-start">
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-text-tertiary shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-mono font-medium">{evt.eventType}</span>
                    <span className="text-[10px] text-text-tertiary ml-2">
                      {format(new Date(evt.createdAt), 'HH:mm:ss.SSS')}
                    </span>
                    {evt.eventData && Object.keys(evt.eventData).length > 0 && (
                      <p className="text-[10px] text-text-tertiary font-mono mt-0.5 truncate">
                        {JSON.stringify(evt.eventData).slice(0, 80)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoPill({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-text-tertiary">{label}:</span>
      <span className={`text-xs font-medium font-mono ${danger ? 'text-danger' : 'text-text'}`}>{value}</span>
    </div>
  );
}
