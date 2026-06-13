import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, type Script } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { GraduationCap, Plus, Eye } from 'lucide-react';
import { format } from 'date-fns';

export function TrainingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const campaigns = useQuery({ queryKey: ['training-campaigns'], queryFn: api.training.campaigns });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });
  const scripts = useQuery({ queryKey: ['scripts'], queryFn: api.scripts.list });

  const trainingCampaigns = campaigns.data ?? [];

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-brand" />
          <h1 className="text-xl font-semibold">Training</h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Training Campaign
        </Button>
      </div>

      <p className="text-sm text-text-secondary">
        Create training campaigns to manually run mystery shopping conversations, then replay them through AI to evaluate extraction quality.
      </p>

      {showCreate && (
        <CreateTrainingCampaign
          sessions={sessions.data ?? []}
          scripts={scripts.data ?? []}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['training-campaigns'] });
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {trainingCampaigns.length === 0 && !showCreate ? (
        <Card>
          <CardContent className="py-12 text-center text-text-tertiary text-sm">
            No training campaigns yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {trainingCampaigns.map((c) => (
            <Card key={c.id} className="hover:border-brand/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/training/${c.id}`)}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">
                    Created {format(new Date(c.createdAt), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/training/${c.id}`); }}>
                    <Eye className="h-4 w-4 mr-1" /> Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTrainingCampaign({ sessions, scripts, onCreated, onCancel }: {
  sessions: Array<{ id: string; name: string; status: string; state: string | null }>;
  scripts: Script[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [scriptId, setScriptId] = useState('');
  const [sessionId, setSessionId] = useState('');

  const createMutation = useMutation({
    mutationFn: () => api.campaigns.create({
      name: name || 'Training Campaign',
      scriptId,
      waSessionId: sessionId,
      pharmacyIds: [],
      settings: {},
      mode: 'training',
    }),
    onSuccess: onCreated,
  });

  return (
    <Card>
      <CardHeader><CardTitle>New Training Campaign</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Name</label>
          <input className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Training - Rivotril SP" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Script</label>
            <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              value={scriptId} onChange={(e) => setScriptId(e.target.value)}>
              <option value="">Select script...</option>
              {scripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">WhatsApp Session</label>
            <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Select session...</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.status}){s.state ? ` - ${s.state}` : ''}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!scriptId || !sessionId || createMutation.isPending}
            onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
        {createMutation.isError && (
          <p className="text-xs text-danger">{(createMutation.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
