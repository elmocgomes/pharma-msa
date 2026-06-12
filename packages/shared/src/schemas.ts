import { z } from 'zod';

export const SendNodeSchema = z.object({
  type: z.literal('send'),
  id: z.string(),
  message: z.string(),
  variants: z.array(z.string()).optional(),
  delay_ms: z.number().default(3000),
  next: z.string(),
});

export const ClassifyBranchSchema = z.object({
  category: z.string(),
  description: z.string(),
  next: z.string(),
});

export const ClassifyNodeSchema = z.object({
  type: z.literal('classify'),
  id: z.string(),
  intent: z.string(),
  branches: z.array(ClassifyBranchSchema).min(1),
  rulePhase: z.string().optional(),
  customRules: z.array(z.object({
    category: z.string(),
    patterns: z.array(z.string()),
    antiPatterns: z.array(z.string()).optional(),
    confidence: z.number(),
  })).optional(),
  timeout_ms: z.number().default(300_000),
  timeout_next: z.string(),
  max_retries: z.number().default(2),
});

export const NextProductNodeSchema = z.object({
  type: z.literal('next_product'),
  id: z.string(),
  has_more_next: z.string(),
  done_next: z.string(),
});

export const CompleteNodeSchema = z.object({
  type: z.literal('complete'),
  id: z.string(),
  message: z.string().optional(),
});

export const FailNodeSchema = z.object({
  type: z.literal('fail'),
  id: z.string(),
  reason: z.string(),
});

export const FlowNodeSchema = z.discriminatedUnion('type', [
  SendNodeSchema,
  ClassifyNodeSchema,
  NextProductNodeSchema,
  CompleteNodeSchema,
  FailNodeSchema,
]);

export const FlowTreeSchema = z.record(z.string(), FlowNodeSchema);

export type SendNode = z.infer<typeof SendNodeSchema>;
export type ClassifyNode = z.infer<typeof ClassifyNodeSchema>;
export type NextProductNode = z.infer<typeof NextProductNodeSchema>;
export type CompleteNode = z.infer<typeof CompleteNodeSchema>;
export type FailNode = z.infer<typeof FailNodeSchema>;
export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowTree = z.infer<typeof FlowTreeSchema>;

export const ConversationStatus = z.enum([
  'pending',
  'greeting',
  'in_progress',
  'waiting_response',
  'recovery',
  'extracting',
  'completed',
  'failed',
  'timeout',
  'error',
]);

export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const VALID_TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  pending:          ['greeting', 'failed'],
  greeting:         ['waiting_response', 'error'],
  waiting_response: ['in_progress', 'timeout', 'error'],
  in_progress:      ['in_progress', 'waiting_response', 'recovery', 'extracting', 'completed', 'failed', 'error'],
  recovery:         ['waiting_response', 'failed', 'error'],
  extracting:       ['completed', 'error'],
  completed:        [],
  failed:           [],
  timeout:          ['waiting_response'],
  error:            [],
};

export function assertValidTransition(from: ConversationStatus, to: ConversationStatus): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid state transition: ${from} → ${to}`);
  }
}

export const CampaignStatus = z.enum(['draft', 'running', 'paused', 'completed']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

export const CampaignPharmacyStatus = z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped']);
export type CampaignPharmacyStatus = z.infer<typeof CampaignPharmacyStatus>;

export const WaSessionStatus = z.enum(['disconnected', 'connecting', 'connected']);
export type WaSessionStatus = z.infer<typeof WaSessionStatus>;

export const MessageDirection = z.enum(['inbound', 'outbound']);
export type MessageDirection = z.infer<typeof MessageDirection>;

export const PersonaDetailsSchema = z.object({
  age: z.number().optional(),
  neighborhood: z.string().optional(),
  backstory: z.string().optional(),
}).passthrough();

export type PersonaDetails = z.infer<typeof PersonaDetailsSchema>;

export const CampaignSettingsSchema = z.object({
  concurrent_limit: z.number().default(5),
  delay_range_ms: z.tuple([z.number(), z.number()]).default([30000, 300000]),
  business_hours: z.object({
    start: z.number().default(8),
    end: z.number().default(18),
  }).default({}),
  rate_limit_per_hour: z.number().default(10),
});

export type CampaignSettings = z.infer<typeof CampaignSettingsSchema>;

export const NavigatorResultSchema = z.object({
  category: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
  is_personal_question: z.boolean(),
});

export type NavigatorResult = z.infer<typeof NavigatorResultSchema>;

export const RecoveryResultSchema = z.object({
  message: z.string(),
  should_retry: z.boolean(),
});

export type RecoveryResult = z.infer<typeof RecoveryResultSchema>;

export const ProductFindingSchema = z.object({
  product_name: z.string(),
  is_available: z.boolean().nullable(),
  price: z.number().nullable(),
  price_currency: z.literal('BRL').default('BRL'),
  has_generic: z.boolean().nullable(),
  generic_names: z.array(z.string()).default([]),
  generic_prices: z.array(z.number()).default([]),
  alternative_names: z.array(z.string()).default([]),
  notes: z.string().default(''),
});

export type ProductFinding = z.infer<typeof ProductFindingSchema>;

export const ExtractorResultSchema = z.object({
  products: z.array(ProductFindingSchema),
  conversation_quality: z.enum(['complete', 'partial', 'poor']),
  pharmacy_responsiveness: z.enum(['cooperative', 'neutral', 'uncooperative']),
});

export type ExtractorResult = z.infer<typeof ExtractorResultSchema>;

// ── Product Classification ──

export const ProductTypeSchema = z.enum(['reference', 'similar', 'generic']);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const ProductPresentationSchema = z.object({
  dosage: z.string().optional(),
  quantity: z.number().optional(),
  form: z.string().optional(),
});
export type ProductPresentation = z.infer<typeof ProductPresentationSchema>;

export const EnrichedProductFindingSchema = z.object({
  product_name_mentioned: z.string(),
  product_type: ProductTypeSchema,
  laboratory: z.string().nullable().default(null),
  is_available: z.boolean().nullable().default(null),
  price: z.number().nullable().default(null),
  price_currency: z.literal('BRL').default('BRL'),
  presentation: ProductPresentationSchema.optional(),
  notes: z.string().default(''),
});
export type EnrichedProductFinding = z.infer<typeof EnrichedProductFindingSchema>;

export const EnrichedExtractorResultSchema = z.object({
  reference_product: z.string(),
  findings: z.array(EnrichedProductFindingSchema),
  conversation_quality: z.enum(['complete', 'partial', 'poor']),
  pharmacy_responsiveness: z.enum(['cooperative', 'neutral', 'uncooperative']),
  pharmacy_asked_for_prescription: z.boolean().default(false),
  pharmacy_offered_delivery: z.boolean().default(false),
});
export type EnrichedExtractorResult = z.infer<typeof EnrichedExtractorResultSchema>;

export const MentionedProductSchema = z.object({
  name_as_mentioned: z.string(),
  product_type: ProductTypeSchema,
  laboratory: z.string().nullable().default(null),
  presentation: ProductPresentationSchema.optional(),
  price: z.number().nullable().default(null),
  is_available: z.boolean().nullable().default(null),
});

export const ProductIdentificationSchema = z.object({
  products_mentioned: z.array(MentionedProductSchema),
  confidence: z.number(),
  reasoning: z.string(),
});
export type ProductIdentification = z.infer<typeof ProductIdentificationSchema>;

// ── Campaign Report ──

export const CampaignReportSchema = z.object({
  campaign_id: z.string(),
  reference_product: z.string(),
  total_pharmacies_contacted: z.number(),
  total_pharmacies_responded: z.number(),
  summary: z.object({
    reference_availability_rate: z.number(),
    reference_avg_price: z.number().nullable(),
    reference_price_range: z.object({
      min: z.number().nullable(),
      max: z.number().nullable(),
    }),
    similares_found: z.array(z.object({
      name: z.string(),
      laboratory: z.string().nullable(),
      availability_rate: z.number(),
      avg_price: z.number().nullable(),
      pharmacies_offering: z.number(),
    })),
    generics_found: z.array(z.object({
      name: z.string(),
      laboratory: z.string().nullable(),
      availability_rate: z.number(),
      avg_price: z.number().nullable(),
      pharmacies_offering: z.number(),
    })),
    prescription_required_rate: z.number(),
    delivery_offered_rate: z.number(),
    avg_conversation_quality: z.string(),
    avg_pharmacy_responsiveness: z.string(),
  }),
  insights: z.array(z.string()),
  recommendations: z.array(z.string()),
  generated_at: z.string(),
});
export type CampaignReport = z.infer<typeof CampaignReportSchema>;
