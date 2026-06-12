import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Session } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import {
  Smartphone, Plus, RefreshCw, Trash2, Plug, Unplug, Phone,
  User, ChevronRight, RotateCcw, Wifi, WifiOff,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function SessionsPage() {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list, refetchInterval: 15000 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const syncAll = useMutation({
    mutationFn: api.sessions.syncAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">WhatsApp Sessions</h1>
          <p className="text-sm text-text-secondary mt-0.5">Manage WhatsApp connections and personas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => syncAll.mutate()} disabled={syncAll.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncAll.isPending ? 'animate-spin' : ''}`} />
            Sync All
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Session
          </Button>
        </div>
      </div>

      {showCreate && <CreateSessionForm onClose={() => setShowCreate(false)} />}

      {sessions.data?.length === 0 ? (
        <EmptyState
          icon={<Smartphone className="h-10 w-10" />}
          title="No sessions"
          description="Create a WhatsApp session to start sending messages"
          action={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> New Session</Button>}
        />
      ) : (
        <div className="space-y-3">
          {sessions.data?.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              expanded={expandedId === session.id}
              onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, expanded, onToggle }: {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['session', session.id],
    queryFn: () => api.sessions.get(session.id),
    enabled: expanded,
  });
  const convos = useQuery({
    queryKey: ['session-convos', session.id],
    queryFn: () => api.sessions.conversations(session.id),
    enabled: expanded,
  });

  const connect = useMutation({
    mutationFn: () => api.sessions.connect(session.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const disconnect = useMutation({
    mutationFn: () => api.sessions.disconnect(session.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const sync = useMutation({
    mutationFn: () => api.sessions.sync(session.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const resetCounter = useMutation({
    mutationFn: () => api.sessions.resetCounter(session.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const deleteSession = useMutation({
    mutationFn: () => api.sessions.delete(session.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const [qrCode, setQrCode] = useState<string | null>(null);

  async function handleConnect() {
    const result = await connect.mutateAsync();
    if (result.qr) setQrCode(result.qr);
  }

  return (
    <Card>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-surface-hover transition-colors rounded-xl"
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          session.status === 'connected' ? 'bg-success-dim text-success' : 'bg-gray-100 text-text-tertiary'
        }`}>
          {session.status === 'connected' ? <Wifi className="h-4.5 w-4.5" /> : <WifiOff className="h-4.5 w-4.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{session.personaName ?? session.name}</span>
            <StatusBadge status={session.status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {session.phoneNumber && (
              <span className="text-xs text-text-secondary flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {session.phoneNumber}
              </span>
            )}
            <span className="text-xs text-text-tertiary">
              {session.dailyMessageCount}/{session.dailyLimit} msgs today
            </span>
          </div>
        </div>
        <span className="text-xs text-text-tertiary">
          {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
        </span>
        <ChevronRight className={`h-4 w-4 text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border-dim">
          {/* Actions */}
          <div className="flex gap-2 px-6 py-3 border-b border-border-dim bg-surface-dim">
            {session.status !== 'connected' ? (
              <Button variant="secondary" size="sm" onClick={handleConnect} disabled={connect.isPending}>
                <Plug className="h-3.5 w-3.5" />
                {connect.isPending ? 'Connecting...' : 'Connect'}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
              Sync
            </Button>
            <Button variant="ghost" size="sm" onClick={() => resetCounter.mutate()}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Counter
            </Button>
            <div className="flex-1" />
            <Button
              variant="danger"
              size="sm"
              onClick={() => { if (confirm('Delete this session?')) deleteSession.mutate(); }}
              disabled={deleteSession.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>

          {/* QR Code */}
          {qrCode && (
            <div className="px-6 py-6 border-b border-border-dim bg-surface-dim flex flex-col items-center">
              <p className="text-sm font-medium mb-3">Scan QR Code with WhatsApp</p>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrCode)}`} alt="QR Code" className="w-48 h-48 rounded-lg" />
              <p className="text-xs text-text-tertiary mt-2">Open WhatsApp &gt; Linked Devices &gt; Link a Device</p>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4 px-6 py-4">
            <InfoBlock label="Session ID" value={session.name} mono />
            <InfoBlock label="DB ID" value={session.id} mono />
            <InfoBlock label="Persona" value={session.personaName ?? '-'} />
            <InfoBlock label="CPF" value={session.personaCpf ?? '-'} />
            {detail.data?.gateway && (
              <>
                <InfoBlock label="Gateway Status" value={detail.data.gateway.status} />
                <InfoBlock
                  label="Connected"
                  value={detail.data.gateway.connection?.isConnected ? 'Yes' : 'No'}
                />
                <InfoBlock label="Platform" value={detail.data.gateway.metadata?.platform ?? '-'} />
                <InfoBlock
                  label="Last Update"
                  value={detail.data.gateway.connection?.lastUpdate
                    ? formatDistanceToNow(new Date(detail.data.gateway.connection.lastUpdate), { addSuffix: true })
                    : '-'}
                />
              </>
            )}
          </div>

          {/* Conversations */}
          {convos.data && convos.data.length > 0 && (
            <div className="border-t border-border-dim">
              <div className="px-6 py-3 bg-surface-dim">
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Conversations ({convos.data.length})
                </h4>
              </div>
              <div className="divide-y divide-border-dim">
                {convos.data.map((conv) => (
                  <a
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className="flex items-center gap-3 px-6 py-2.5 hover:bg-surface-hover transition-colors"
                  >
                    <StatusBadge status={conv.status} />
                    <span className="text-sm truncate flex-1">{conv.variables?.product_name ?? conv.id.slice(0, 8)}</span>
                    <span className="text-xs text-text-tertiary tabular-nums">
                      {conv.messageCounts.inbound}in / {conv.messageCounts.outbound}out
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">{label}</p>
      <p className={`text-sm text-text mt-0.5 ${mono ? 'font-mono text-xs' : ''} truncate`}>{value}</p>
    </div>
  );
}

function CreateSessionForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [personaName, setPersonaName] = useState('');

  const create = useMutation({
    mutationFn: (data: { name: string; personaName?: string }) => api.sessions.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      onClose();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Session</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fallbackName = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            create.mutate({ name: name || fallbackName, personaName: personaName || undefined });
          }}
          className="flex gap-3 items-end"
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-text-secondary">Session Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="auto-generated if empty"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-text-secondary">Persona Name</label>
            <input
              value={personaName}
              onChange={(e) => setPersonaName(e.target.value)}
              placeholder="e.g. Maria Silva"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-brand focus:border-brand"
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            <User className="h-3.5 w-3.5" />
            {create.isPending ? 'Creating...' : 'Create'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
