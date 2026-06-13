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
    create: (data: { name: string; personaName?: string; personaCpf?: string; personaDetails?: Record<string, unknown> }) =>
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
    create: (data: { name: string; scriptId: string; waSessionId: string; pharmacyIds: string[]; productIds?: string[]; anvisaProductIds?: string[]; settings?: Record<string, unknown>; mode?: 'auto' | 'training' }) =>
      request<Campaign>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    start: (id: string) => request<{ status: string }>(`/campaigns/${id}/start`, { method: 'POST' }),
    pause: (id: string) => request<{ status: string }>(`/campaigns/${id}/pause`, { method: 'POST' }),
    delete: (id: string) => request<{ status: string }>(`/campaigns/${id}`, { method: 'DELETE' }),
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
    list: (params?: { page?: number; limit?: number; q?: string; state?: string; chain?: string }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.q) qs.set('q', params.q);
      if (params?.state) qs.set('state', params.state);
      if (params?.chain) qs.set('chain', params.chain);
      return request<PharmacyListResult>(`/pharmacies?${qs.toString()}`);
    },
    chains: () => request<ChainCount[]>('/pharmacies/chains'),
    states: () => request<StateCount[]>('/pharmacies/states'),
    create: (data: { name: string; phoneNumber: string; city?: string; state?: string; notes?: string }) =>
      request<Pharmacy>('/pharmacies', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pharmacy>) =>
      request<Pharmacy>(`/pharmacies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ status: string }>(`/pharmacies/${id}`, { method: 'DELETE' }),
  },
  scraper: {
    stats: () => request<{
      total: number; withWhatsApp: number; verified: number;
      withChain: number; withAssociation: number;
      topChains: { name: string; count: number }[];
    }>('/scraper/stats'),
    detectChains: () =>
      request<{ updated: number }>('/scraper/detect-chains', { method: 'POST' }),
    whatsappCheck: (sessionId: string, state?: string, limit?: number) =>
      request<{ checked: number; withWhatsApp: number; results: { id: string; name: string; phone: string; isWhatsApp: boolean }[] }>(
        '/scraper/whatsapp-check', { method: 'POST', body: JSON.stringify({ sessionId, state, limit }) },
      ),
  },
  products: {
    list: () => request<Product[]>('/products'),
    create: (data: { name: string; activeIngredient?: string; category?: string; brand?: string; dosage?: string; productType?: string }) =>
      request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Product>) =>
      request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ status: string }>(`/products/${id}`, { method: 'DELETE' }),
    fromAnvisa: (anvisaId: string) =>
      request<Product>(`/products/from-anvisa/${anvisaId}`, { method: 'POST' }),
  },
  scripts: {
    list: () => request<Script[]>('/scripts'),
  },
  health: () => request<{ status: string; timestamp: string }>('/health'),
  prompts: {
    list: () => request<Record<string, AgentPrompt[]>>('/prompts'),
    get: (id: string) => request<AgentPromptWithVersions>(`/prompts/${id}`),
    update: (id: string, data: { content: string; changeReason?: string }) =>
      request<AgentPrompt>(`/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    revert: (id: string, version: number) =>
      request<AgentPrompt>(`/prompts/${id}/revert/${version}`, { method: 'POST' }),
    chat: (message: string, messages?: Array<{ role: 'user' | 'assistant'; content: string }>) =>
      request<{ response: string; toolsUsed?: string[]; usage: { inputTokens: number; outputTokens: number } }>(
        '/prompt-chat', { method: 'POST', body: JSON.stringify({ message, messages }) },
      ),
  },
  reports: {
    get: (campaignId: string) => request<CampaignReportData>(`/reports/campaigns/${campaignId}/report`),
    generate: (campaignId: string) =>
      request<{ status: string }>(`/reports/campaigns/${campaignId}/analyze`, { method: 'POST' }),
  },
  anvisa: {
    search: (params: { q?: string; tipo?: string; substancia?: string; state?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.tipo) qs.set('tipo', params.tipo);
      if (params.substancia) qs.set('substancia', params.substancia);
      if (params.state) qs.set('state', params.state);
      if (params.page) qs.set('page', String(params.page));
      if (params.limit) qs.set('limit', String(params.limit));
      return request<AnvisaSearchResult>(`/anvisa/products?${qs.toString()}`);
    },
    get: (id: string, state?: string) =>
      request<AnvisaProductDetail>(`/anvisa/products/${id}${state ? `?state=${state}` : ''}`),
    bySubstance: (substance: string, state?: string) =>
      request<{ substance: string; count: number; products: AnvisaProduct[] }>(
        `/anvisa/products/by-substance/${encodeURIComponent(substance)}${state ? `?state=${state}` : ''}`,
      ),
    stats: () => request<{ total: number; byType: { tipoProduto: string; count: number }[] }>('/anvisa/stats'),
    icmsRates: () => request<{ stateRates: Record<string, string>; availableRates: string[] }>('/anvisa/icms-rates'),
  },
  campaignGroups: {
    list: () => request<CampaignGroup[]>('/campaign-groups'),
    get: (id: string) => request<CampaignGroupDetail>(`/campaign-groups/${id}`),
    create: (data: { name: string; scriptId: string; productIds?: string[]; anvisaProductIds?: string[]; targetStates: string[] }) =>
      request<{ group: CampaignGroup; campaigns: Campaign[] }>('/campaign-groups', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ status: string }>(`/campaign-groups/${id}`, { method: 'DELETE' }),
  },
  training: {
    campaigns: () => request<Campaign[]>('/training/campaigns'),
    createConversation: (campaignId: string, pharmacyId: string) =>
      request<Conversation>(`/training/campaigns/${campaignId}/conversations`, {
        method: 'POST', body: JSON.stringify({ pharmacyId }),
      }),
    getConversation: (id: string) =>
      request<TrainingConversationDetail>(`/training/conversations/${id}`),
    sendMessage: (conversationId: string, text: string) =>
      request<Message>(`/training/conversations/${conversationId}/send`, {
        method: 'POST', body: JSON.stringify({ text }),
      }),
    complete: (conversationId: string) =>
      request<{ status: string }>(`/training/conversations/${conversationId}/complete`, { method: 'POST' }),
    replay: (conversationId: string) =>
      request<{ evaluation: TrainingEvaluation; extraction: Record<string, unknown> }>(
        `/training/conversations/${conversationId}/replay`, { method: 'POST' },
      ),
    getEvaluation: (conversationId: string) =>
      request<TrainingEvaluation>(`/training/conversations/${conversationId}/evaluation`),
    saveCorrections: (evaluationId: string, corrections: Record<string, unknown>, notes: string) =>
      request<TrainingEvaluation>(`/training/evaluations/${evaluationId}`, {
        method: 'PATCH', body: JSON.stringify({ corrections, notes }),
      }),
  },
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
  state: string | null;
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
  pmcValue: number | null;
  pmcExceeded: boolean | null;
}

export interface Script {
  id: string;
  name: string;
  description: string | null;
  entryNodeId: string;
  version: number;
  isActive: boolean;
  createdAt: string;
}

export interface Pharmacy {
  id: string;
  name: string;
  phoneNumber: string;
  city: string | null;
  state: string | null;
  notes: string | null;
  cnpj: string | null;
  matrizFilial: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  phone2: string | null;
  email: string | null;
  cnaePrimario: string | null;
  cnaeDescricao: string | null;
  tipoLogradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  codigoMunicipio: number | null;
  porte: string | null;
  naturezaJuridica: string | null;
  dataAtividade: string | null;
  dataSituacao: string | null;
  chainName: string | null;
  associationName: string | null;
  whatsappNumber: string | null;
  whatsappVerified: boolean;
  lastScrapedAt: string | null;
  scrapeSource: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PharmacyListResult {
  data: Pharmacy[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface ChainCount {
  chainName: string;
  count: number;
}

export interface StateCount {
  state: string;
  count: number;
}

export interface Product {
  id: string;
  name: string;
  activeIngredient: string | null;
  category: string | null;
  brand: string | null;
  dosage: string | null;
  productType: 'reference' | 'similar' | 'generic';
  createdAt: string;
}

export interface AgentPrompt {
  id: string;
  agentName: string;
  promptType: string;
  content: string;
  version: number;
  isActive: boolean;
  metadata: { description?: string; model?: string; temperature?: number; maxTokens?: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  content: string;
  changedBy: string | null;
  changeReason: string | null;
  createdAt: string;
}

export interface AgentPromptWithVersions extends AgentPrompt {
  versions: PromptVersion[];
}

export interface CampaignReportData {
  id: string;
  campaignId: string;
  report: {
    campaign_id: string;
    reference_product: string;
    total_pharmacies_contacted: number;
    total_pharmacies_responded: number;
    summary: {
      reference_availability_rate: number;
      reference_avg_price: number | null;
      reference_price_range: { min: number | null; max: number | null };
      similares_found: Array<{ name: string; laboratory: string | null; availability_rate: number; avg_price: number | null; pharmacies_offering: number }>;
      generics_found: Array<{ name: string; laboratory: string | null; availability_rate: number; avg_price: number | null; pharmacies_offering: number }>;
      prescription_required_rate: number;
      delivery_offered_rate: number;
      avg_conversation_quality: string;
      avg_pharmacy_responsiveness: string;
    };
    insights: string[];
    recommendations: string[];
    generated_at: string;
  };
  createdAt: string;
}

export interface AnvisaProduct {
  id: string;
  substancia: string;
  produto: string;
  apresentacao: string;
  dosagem: string | null;
  forma: string | null;
  quantidade: string | null;
  laboratorio: string | null;
  tipoProduto: string;
  ean: string | null;
  codigoGgrem: string | null;
  registro: string | null;
  classeTerapeutica: string | null;
  tarja: string | null;
  regimePreco: string | null;
  pmcByIcms: Record<string, string>;
  pmc?: number | null;
  icmsRate?: string;
  importedAt: string;
}

export interface AnvisaProductDetail extends AnvisaProduct {
  pmcAllStates: Record<string, number | null>;
}

export interface AnvisaSearchResult {
  data: AnvisaProduct[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface CampaignGroup {
  id: string;
  name: string;
  scriptId: string;
  productIds: string[];
  targetStates: string[];
  settings: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignGroupDetail extends CampaignGroup {
  campaigns: Campaign[];
}

export interface TrainingConversationDetail {
  conversation: Conversation;
  messages: Message[];
  pharmacy: Pharmacy;
  session: Session;
}

export interface TrainingEvaluation {
  id: string;
  conversationId: string;
  extractionResult: Record<string, unknown> | null;
  adminCorrections: Record<string, unknown> | null;
  notes: string | null;
  status: 'pending' | 'evaluated' | 'applied';
  createdAt: string;
  updatedAt: string;
}
