const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

// Sessions
export const api = {
  sessions: {
    list: () => request<Session[]>('/sessions'),
    get: (id: string) => request<SessionDetail>(`/sessions/${id}`),
    create: (data: { name: string; personaName?: string; personaCpf?: string }) =>
      request<Session>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Session>) =>
      request<Session>(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ status: string }>(`/sessions/${id}`, { method: 'DELETE' }),
    connect: (id: string) =>
      request<{ qr?: string; message?: string }>(`/sessions/${id}/connect`, { method: 'POST' }),
    disconnect: (id: string) =>
      request<{ status: string }>(`/sessions/${id}/disconnect`, { method: 'POST' }),
    sync: (id: string) =>
      request<SessionDetail>(`/sessions/${id}/sync`, { method: 'POST' }),
    syncAll: () =>
      request<SyncResult>('/sessions/sync-all', { method: 'POST' }),
    conversations: (id: string) =>
      request<ConversationWithCounts[]>(`/sessions/${id}/conversations`),
    resetCounter: (id: string) =>
      request<Session>(`/sessions/${id}/reset-counter`, { method: 'POST' }),
    checkNumber: (id: string, phone: string) =>
      request<{ phone: string; isRegistered: boolean }>(`/sessions/${id}/check-number`, {
        method: 'POST', body: JSON.stringify({ phone }),
      }),
  },
  campaigns: {
    list: () => request<Campaign[]>('/campaigns'),
    get: (id: string) => request<Campaign>(`/campaigns/${id}`),
    start: (id: string) => request<{ status: string }>(`/campaigns/${id}/start`, { method: 'POST' }),
  },
  conversations: {
    list: (campaignId?: string) =>
      request<Conversation[]>(`/conversations${campaignId ? `?campaignId=${campaignId}` : ''}`),
    get: (id: string) => request<Conversation>(`/conversations/${id}`),
    messages: (id: string) => request<Message[]>(`/conversations/${id}/messages`),
    events: (id: string) => request<ConversationEvent[]>(`/conversations/${id}/events`),
    extraction: (id: string) => request<ExtractionResult>(`/conversations/${id}/extraction`),
  },
  pharmacies: {
    list: () => request<Pharmacy[]>('/pharmacies'),
  },
  products: {
    list: () => request<Product[]>('/products'),
  },
  health: () => request<{ status: string; timestamp: string }>('/health'),
};

// Types
export interface Session {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: 'disconnected' | 'connecting' | 'connected';
  dailyMessageCount: number;
  dailyLimit: number;
  lastResetAt: string | null;
  personaName: string | null;
  personaCpf: string | null;
  personaDetails: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  gateway?: { status: string; synced: boolean };
}

export interface SessionDetail extends Omit<Session, 'gateway'> {
  gateway: {
    session: string;
    status: string;
    details?: { name?: string; phoneNumber?: string };
    connection?: { isConnected: boolean; lastUpdate: string };
    metadata?: { platform?: string; deviceManufacturer?: string; deviceModel?: string };
  } | null;
}

export interface SyncResult {
  synced: string[];
  orphaned: string[];
  missing: string[];
}

export interface Campaign {
  id: string;
  name: string;
  scriptId: string;
  waSessionId: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  campaignId: string;
  pharmacyId: string;
  waSessionId: string;
  scriptId: string;
  currentNodeId: string | null;
  nodeVisitCount: number;
  status: string;
  variables: Record<string, string>;
  productIndex: number;
  errorReason: string | null;
  retryCount: number;
  version: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithCounts extends Conversation {
  messageCounts: { total: number; inbound: number; outbound: number };
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  mediaUrl: string | null;
  nodeId: string | null;
  createdAt: string;
}

export interface ConversationEvent {
  id: string;
  conversationId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  traceId: string;
  sequenceNumber: number;
  createdAt: string;
}

export interface ExtractionResult {
  id: string;
  conversationId: string;
  rawAnalysis: {
    products: ProductFinding[];
    conversation_quality: string;
    pharmacy_responsiveness: string;
  };
  findings: ProductFindingRow[];
  createdAt: string;
}

export interface ProductFinding {
  product_name: string;
  is_available: boolean | null;
  price: number | null;
  price_currency: string;
  has_generic: boolean | null;
  generic_names: string[];
  generic_prices: number[];
  alternative_names: string[];
  notes: string;
}

export interface ProductFindingRow {
  id: string;
  productNameMentioned: string;
  isAvailable: boolean | null;
  price: number | null;
  priceUnit: string | null;
  hasGeneric: boolean | null;
  genericNames: string[] | null;
  genericPrices: number[] | null;
  alternativeNames: string[] | null;
  notes: string | null;
}

export interface Pharmacy {
  id: string;
  name: string;
  phoneNumber: string;
  city: string | null;
  state: string | null;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  activeIngredient: string | null;
  category: string | null;
  brand: string | null;
  createdAt: string;
}
