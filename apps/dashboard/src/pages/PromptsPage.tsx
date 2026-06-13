import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AgentPrompt } from '@/lib/api';

const AGENT_LABELS: Record<string, string> = {
  navigator: 'Navigator',
  recovery: 'Recovery',
  extractor: 'Extractor',
  extractor_enriched: 'Extractor (Enriched)',
  product_identifier: 'Product Identifier',
  campaign_analyst: 'Campaign Analyst',
};

export function PromptsPage() {
  const queryClient = useQueryClient();
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [showChat, setShowChat] = useState(false);

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: api.prompts.list,
  });

  const { data: selectedPrompt } = useQuery({
    queryKey: ['prompt', selectedPromptId],
    queryFn: () => api.prompts.get(selectedPromptId!),
    enabled: !!selectedPromptId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { content: string; changeReason?: string }) =>
      api.prompts.update(selectedPromptId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['prompt', selectedPromptId] });
    },
  });

  const revertMutation = useMutation({
    mutationFn: (version: number) => api.prompts.revert(selectedPromptId!, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['prompt', selectedPromptId] });
    },
  });

  const chatMutation = useMutation({
    mutationFn: (message: string) => api.prompts.chat(message, chatHistory),
    onSuccess: (data, message) => {
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: data.response ?? '' },
      ]);
      setChatMessage('');
      if (data.toolsUsed?.includes('update_prompt')) {
        queryClient.invalidateQueries({ queryKey: ['prompts'] });
        queryClient.invalidateQueries({ queryKey: ['prompt', selectedPromptId] });
      }
    },
  });

  function handleSelectPrompt(prompt: AgentPrompt) {
    setSelectedPromptId(prompt.id);
    setEditContent(prompt.content);
    setChangeReason('');
  }

  function handleSave() {
    if (!editContent.trim()) return;
    updateMutation.mutate({ content: editContent, changeReason: changeReason || undefined });
  }

  function handleChat() {
    if (!chatMessage.trim()) return;
    chatMutation.mutate(chatMessage);
  }

  if (isLoading) return <div className="p-6 text-gray-500">Loading prompts...</div>;

  return (
    <div className="flex h-full">
      {/* Left: Agent List */}
      <div className="w-64 border-r border-border bg-surface-raised p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Agent Prompts</h2>
        {prompts && Object.entries(prompts).map(([agentName, agentPrompts]) => (
          <div key={agentName} className="mb-4">
            <h3 className="text-sm font-medium text-text-secondary mb-1">
              {AGENT_LABELS[agentName] ?? agentName}
            </h3>
            {agentPrompts.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPrompt(p)}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  selectedPromptId === p.id
                    ? 'bg-brand-dim text-brand'
                    : 'hover:bg-surface-hover'
                }`}
              >
                <div className="font-mono text-xs text-text-tertiary">{p.promptType}</div>
                <div className="text-xs text-text-tertiary">v{p.version}</div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Center: Editor */}
      <div className="flex-1 flex flex-col p-4">
        {selectedPrompt ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {AGENT_LABELS[selectedPrompt.agentName] ?? selectedPrompt.agentName} — {selectedPrompt.promptType}
                </h2>
                <p className="text-sm text-text-secondary">
                  v{selectedPrompt.version} | Last updated: {new Date(selectedPrompt.updatedAt).toLocaleString()}
                  {selectedPrompt.metadata?.model && ` | Model: ${selectedPrompt.metadata.model}`}
                  {selectedPrompt.metadata?.temperature != null && ` | Temp: ${selectedPrompt.metadata.temperature}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowChat(!showChat)}
                  className="px-3 py-1.5 text-sm bg-purple-900/30 text-purple-300 rounded hover:bg-purple-900/50"
                >
                  {showChat ? 'Hide Chat' : 'AI Assistant'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending || editContent === selectedPrompt.content}
                  className="px-3 py-1.5 text-sm bg-brand text-white rounded hover:bg-brand/80 disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 font-mono text-sm border border-border rounded p-3 resize-none bg-surface text-text focus:ring-2 focus:ring-brand/30 focus:outline-none"
              placeholder="Prompt content..."
            />

            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Change reason (optional)"
                className="flex-1 text-sm border border-border rounded px-3 py-1.5 bg-surface text-text"
              />
            </div>

            {/* Version History */}
            {selectedPrompt.versions && selectedPrompt.versions.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-text-secondary mb-2">Version History</h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {selectedPrompt.versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-xs bg-surface-raised rounded px-3 py-2">
                      <div>
                        <span className="font-medium">v{v.version}</span>
                        <span className="text-text-tertiary ml-2">{v.changedBy}</span>
                        {v.changeReason && <span className="text-text-secondary ml-2">— {v.changeReason}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-text-tertiary">{new Date(v.createdAt).toLocaleDateString()}</span>
                        <button
                          onClick={() => revertMutation.mutate(v.version)}
                          className="text-brand hover:underline"
                        >
                          Revert
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary">
            Select a prompt from the sidebar to edit
          </div>
        )}
      </div>

      {/* Right: Chat Panel */}
      {showChat && (
        <div className="w-96 border-l border-border bg-surface-raised flex flex-col">
          <div className="p-3 border-b border-border bg-purple-900/20">
            <h3 className="font-medium text-purple-300">Prompt Manager AI</h3>
            <p className="text-xs text-purple-400">Ask for help crafting or improving prompts</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block rounded-lg px-3 py-2 max-w-[85%] ${
                  msg.role === 'user'
                    ? 'bg-brand-dim text-brand'
                    : 'bg-surface border border-border text-text'
                }`}>
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="text-sm text-text-tertiary">Thinking...</div>
            )}
          </div>
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
                placeholder="Ask about prompts..."
                className="flex-1 text-sm border border-border rounded px-3 py-1.5 bg-surface text-text"
              />
              <button
                onClick={handleChat}
                disabled={chatMutation.isPending}
                className="px-3 py-1.5 text-sm bg-purple-700 text-white rounded hover:bg-purple-600 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
