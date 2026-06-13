import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Message, type TrainingEvaluation } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { ArrowLeft, Send, Bot, User, Play, CheckCircle, Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';

export function TrainingConversationPage() {
  const { campaignId, conversationId } = useParams<{ campaignId: string; conversationId?: string }>();
  const navigate = useNavigate();
  const [activeConvId, setActiveConvId] = useState<string | null>(conversationId ?? null);

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/training')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Training Session</h1>
      </div>

      {!activeConvId ? (
        <StartConversation campaignId={campaignId!} onStarted={(id) => setActiveConvId(id)} />
      ) : (
        <ChatSession conversationId={activeConvId} onBack={() => setActiveConvId(null)} />
      )}
    </div>
  );
}

function StartConversation({ campaignId, onStarted }: { campaignId: string; onStarted: (id: string) => void }) {
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: api.pharmacies.list });
  const [selectedPharmacy, setSelectedPharmacy] = useState('');
  const conversations = useQuery({ queryKey: ['conversations', campaignId], queryFn: () => api.conversations.list(campaignId) });

  const createMutation = useMutation({
    mutationFn: () => api.training.createConversation(campaignId, selectedPharmacy),
    onSuccess: (conv) => onStarted(conv.id),
  });

  const existingConvs = conversations.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Start Training Conversation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Pharmacy</label>
            <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              value={selectedPharmacy} onChange={(e) => setSelectedPharmacy(e.target.value)}>
              <option value="">Select pharmacy...</option>
              {(pharmacies.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.phoneNumber}</option>
              ))}
            </select>
          </div>
          <Button size="sm" disabled={!selectedPharmacy || createMutation.isPending}
            onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? 'Creating...' : 'Start Conversation'}
          </Button>
          {createMutation.isError && (
            <p className="text-xs text-danger">{(createMutation.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      {existingConvs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Previous Conversations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {existingConvs.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <span className="text-sm font-medium">{c.variables?.product_name ?? 'Conversation'}</span>
                  <span className="text-xs text-text-tertiary ml-2">
                    {format(new Date(c.createdAt), 'dd/MM HH:mm')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={c.status} />
                  <Button variant="ghost" size="sm" onClick={() => onStarted(c.id)}>
                    Open
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ChatSession({ conversationId }: { conversationId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const detail = useQuery({
    queryKey: ['training-conv', conversationId],
    queryFn: () => api.training.getConversation(conversationId),
    refetchInterval: 3000,
  });

  const evaluation = useQuery({
    queryKey: ['training-eval', conversationId],
    queryFn: () => api.training.getEvaluation(conversationId),
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) => api.training.sendMessage(conversationId, text),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['training-conv', conversationId] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => api.training.complete(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['training-conv', conversationId] }),
  });

  const replayMutation = useMutation({
    mutationFn: () => api.training.replay(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['training-eval', conversationId] }),
  });

  const conv = detail.data?.conversation;
  const msgs = detail.data?.messages ?? [];
  const pharmacy = detail.data?.pharmacy;
  const isCompleted = conv?.status === 'completed';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    sendMutation.mutate(text);
  };

  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      {/* Chat panel */}
      <Card className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
        <CardHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {pharmacy?.name ?? 'Chat'}
                {conv && <StatusBadge status={conv.status} />}
              </CardTitle>
              {pharmacy && <p className="text-xs text-text-tertiary mt-0.5">{pharmacy.phoneNumber}</p>}
            </div>
            <div className="flex gap-2">
              {!isCompleted && (
                <Button variant="secondary" size="sm" onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  {completeMutation.isPending ? 'Completing...' : 'Complete'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-4 py-2 space-y-3">
          {msgs.length === 0 && (
            <p className="text-center text-sm text-text-tertiary py-8">
              No messages yet. Type a message to start the conversation.
            </p>
          )}
          {msgs.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        {!isCompleted ? (
          <div className="shrink-0 border-t border-border p-3">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message..."
                disabled={sendMutation.isPending}
              />
              <Button size="sm" onClick={handleSend} disabled={!message.trim() || sendMutation.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {sendMutation.isError && (
              <p className="text-xs text-danger mt-1">{(sendMutation.error as Error).message}</p>
            )}
          </div>
        ) : (
          <div className="shrink-0 border-t border-border p-3 text-center text-xs text-text-tertiary">
            Conversation completed
          </div>
        )}
      </Card>

      {/* Right panel — context + evaluation */}
      <div className="space-y-4">
        {/* Conversation variables */}
        {conv?.variables && Object.keys(conv.variables).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Context</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(conv.variables).map(([key, val]) => (
                <div key={key}>
                  <span className="text-xs font-medium text-text-secondary">{key}</span>
                  <p className="text-xs text-text truncate" title={val}>{val}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* AI Replay */}
        {isCompleted && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Play className="h-4 w-4" /> AI Replay
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!evaluation.data && !replayMutation.isPending && (
                <Button size="sm" className="w-full" onClick={() => replayMutation.mutate()}>
                  Run AI Extraction
                </Button>
              )}
              {replayMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 className="h-4 w-4 animate-spin" /> Running extraction...
                </div>
              )}
              {replayMutation.isError && (
                <p className="text-xs text-danger">{(replayMutation.error as Error).message}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Evaluation results */}
        {evaluation.data && (
          <EvaluationPanel evaluation={evaluation.data} conversationId={conversationId} />
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === 'outbound';
  return (
    <div className={`flex gap-2.5 ${isOut ? '' : 'flex-row-reverse'}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        isOut ? 'bg-brand-dim text-brand' : 'bg-success-dim text-success'
      }`}>
        {isOut ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </div>
      <div className={`max-w-[80%] ${isOut ? '' : 'text-right'}`}>
        <div className={`inline-block rounded-xl px-3.5 py-2 text-sm ${
          isOut ? 'bg-brand text-white rounded-tl-sm' : 'bg-gray-100 text-text rounded-tr-sm'
        }`}>
          {msg.content}
        </div>
        <div className="text-[10px] text-text-tertiary mt-0.5">
          {format(new Date(msg.createdAt), 'HH:mm:ss')}
        </div>
      </div>
    </div>
  );
}

function EvaluationPanel({ evaluation, conversationId }: { evaluation: TrainingEvaluation; conversationId: string }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(evaluation.notes ?? '');
  const [corrections, setCorrections] = useState(
    JSON.stringify(evaluation.adminCorrections ?? {}, null, 2),
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(corrections); } catch { /* keep empty */ }
      return api.training.saveCorrections(evaluation.id, parsed, notes);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['training-eval', conversationId] }),
  });

  const extraction = evaluation.extractionResult as {
    products?: Array<{
      product_name: string;
      is_available: boolean | null;
      price: number | null;
      has_generic: boolean | null;
      generic_names?: string[];
      notes?: string;
    }>;
    conversation_quality?: string;
    pharmacy_responsiveness?: string;
  } | null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" /> Evaluation
          <StatusBadge status={evaluation.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {extraction?.products?.map((p, i) => (
          <div key={i} className="border border-border/50 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold">{p.product_name}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-text-secondary">Available:</span>
              <span>{p.is_available == null ? '—' : p.is_available ? 'Yes' : 'No'}</span>
              <span className="text-text-secondary">Price:</span>
              <span>{p.price != null ? `R$ ${p.price.toFixed(2)}` : '—'}</span>
              <span className="text-text-secondary">Generic:</span>
              <span>{p.has_generic == null ? '—' : p.has_generic ? 'Yes' : 'No'}</span>
            </div>
            {p.generic_names && p.generic_names.length > 0 && (
              <p className="text-xs text-text-tertiary">Generics: {p.generic_names.join(', ')}</p>
            )}
            {p.notes && <p className="text-xs text-text-tertiary">{p.notes}</p>}
          </div>
        ))}

        {extraction && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="text-text-secondary">Quality:</span>
            <span>{extraction.conversation_quality ?? '—'}</span>
            <span className="text-text-secondary">Responsiveness:</span>
            <span>{extraction.pharmacy_responsiveness ?? '—'}</span>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Admin Notes</label>
          <textarea className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs min-h-[60px]"
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes about extraction accuracy..." />
        </div>

        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Corrections (JSON)</label>
          <textarea className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-mono min-h-[80px]"
            value={corrections} onChange={(e) => setCorrections(e.target.value)}
            placeholder='{"product_name": "corrected value"}' />
        </div>

        <Button size="sm" className="w-full" onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Save Evaluation'}
        </Button>
        {saveMutation.isError && (
          <p className="text-xs text-danger">{(saveMutation.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
