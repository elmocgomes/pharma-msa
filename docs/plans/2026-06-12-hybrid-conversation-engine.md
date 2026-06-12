# Hybrid Conversation Engine & Multi-Agent Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cost-optimized conversation engine with 3-tier classification (rule → Haiku → Sonnet), rich pharmaceutical product intelligence (reference/similar/generic categorization), batch campaign analysis, and an admin prompt management interface.

**Architecture:** Campaigns target a **reference product** (full presentation: name, dosage, quantity, form, laboratory) and track its market landscape — branded generics ("similares") and unbranded generics. The conversation engine uses preset messages with variant rotation, a 3-tier classifier for incoming pharmacy responses, and a multi-agent pipeline: **Navigator** (classify responses), **Recovery** (handle off-script), **Product Identifier** (recognize mentioned products mid-conversation), **Extractor** (post-conversation structured data), **Campaign Analyst** (batch market intelligence across all conversations), and **Prompt Manager** (admin-facing chat to tune all agent prompts).

**Tech Stack:** TypeScript, Zod schemas, BullMQ workers, Anthropic (Haiku + Sonnet), existing `@pharma/ai` provider abstraction, `@pharma/shared` schemas, Drizzle ORM.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Pharma MSA v2                               │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │   wa-gateway     │  │   API (Hono)    │  │   Worker (BullMQ)   │  │
│  │   WhatsApp       │  │   REST + WH     │  │                     │  │
│  │   bridge         │  │   Dashboard     │  │   ┌─ campaign       │  │
│  └────────┬─────────┘  │   Prompt Mgmt   │  │   ├─ conversation   │  │
│           │            └────────┬────────┘  │   ├─ parse          │  │
│           │                     │           │   ├─ extract        │  │
│           └─────────────────────┤           │   ├─ analyze        │  │
│                                 │           │   └─ maintenance    │  │
│                            ┌────┴────┐      └────────┬────────────┘  │
│                            │  Redis  │               │               │
│                            └─────────┘               │               │
│                                                      │               │
│                          Supabase PostgreSQL ◄────────┘               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                        Agent Pipeline                                │
│                                                                      │
│  Inbound msg → [Personal?] → [Tier1 Rules] → [Tier2 Navigator]      │
│                                    │              │                  │
│                              match │         classify│               │
│                                    ▼              ▼                  │
│                              Branch          [Product Identifier]    │
│                              directly         extract product refs   │
│                                                    │                 │
│                                    ┌───── low conf ▼                 │
│                                    │    [Tier3 Recovery]             │
│                                    │    freeform response            │
│                                    │                                 │
│  Conversation done ──────────────▶ [Extractor] ──▶ product_findings  │
│                                                                      │
│  All convos in campaign done ────▶ [Campaign Analyst] ──▶ reports    │
│                                                                      │
│  Admin ──────────────────────────▶ [Prompt Manager] ──▶ prompt edits │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Part A: Pharmaceutical Product Model

### Current State

The `products` table is flat: `name`, `active_ingredient`, `category`, `brand`, `dosage`. No concept of reference vs similar vs generic. The extractor outputs a flat list of `ProductFinding` with `generic_names` and `alternative_names` as string arrays — no structured categorization.

### Target State

Products become a **tree**: a reference product links to its known similares (branded generics) and genéricos (unbranded). The extractor output captures exactly which product category the pharmacy offered, with full presentation details.

---

## Summary of Changes

| What | Where | Action |
|------|-------|--------|
| **Part A: Product Model** | | |
| Product schema (type, presentation, FK) | `packages/db/src/schema/products.ts` | **Modify** |
| Product finding schema (classification) | `packages/db/src/schema/extractions.ts` | **Modify** |
| Zod schemas (product types) | `packages/shared/src/schemas.ts` | **Modify** |
| SQL migration | `packages/db/migrations/` | **Create** |
| **Part B: Rule Engine (Tasks 1-3)** | | |
| Rule engine core | `packages/shared/src/rules/` | **Create** |
| Personal question handler | `packages/shared/src/rules/personal.ts` | **Create** |
| **Part C: Script Engine (Tasks 4-9)** | | |
| Updated script schemas | `packages/shared/src/schemas.ts` | **Modify** |
| Message variant selector | `apps/worker/src/engine/message-builder.ts` | **Modify** |
| 3-tier classifier | `apps/worker/src/engine/classifier.ts` | **Create** |
| Parse worker integration | `apps/worker/src/workers/parse.worker.ts` | **Modify** |
| Script runner (variants) | `apps/worker/src/engine/script-runner.ts` | **Modify** |
| Default script template | `packages/shared/src/templates/` | **Create** |
| **Part D: Agent System (Tasks 10-15)** | | |
| Product Identifier agent | `packages/ai/src/agents/product-identifier.ts` | **Create** |
| Enhanced Extractor agent | `packages/ai/src/agents/extractor.ts` | **Modify** |
| Campaign Analyst agent | `packages/ai/src/agents/campaign-analyst.ts` | **Create** |
| Prompt registry (DB-backed) | `packages/db/src/schema/prompts.ts` | **Create** |
| Prompt Manager API routes | `apps/api/src/routes/prompts.ts` | **Create** |
| Prompt Manager chat endpoint | `apps/api/src/routes/prompt-chat.ts` | **Create** |
| Campaign reports table + routes | `packages/db/src/schema/reports.ts` | **Create** |
| Analyze worker | `apps/worker/src/workers/analyze.worker.ts` | **Create** |
| Dashboard: Prompt Management page | `apps/dashboard/src/pages/PromptsPage.tsx` | **Create** |

---

## Task 1: Enrich Product Data Model

**Files:**
- Modify: `packages/db/src/schema/products.ts`
- Create: `packages/db/migrations/0008_product_classification.sql`
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/__tests__/product-schemas.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/product-schemas.test.ts
import { describe, it, expect } from 'vitest';
import { ProductTypeSchema, ProductPresentationSchema, EnrichedProductFindingSchema } from '../schemas.js';

describe('ProductTypeSchema', () => {
  it('accepts reference', () => {
    expect(ProductTypeSchema.safeParse('reference').success).toBe(true);
  });
  it('accepts similar', () => {
    expect(ProductTypeSchema.safeParse('similar').success).toBe(true);
  });
  it('accepts generic', () => {
    expect(ProductTypeSchema.safeParse('generic').success).toBe(true);
  });
  it('rejects unknown', () => {
    expect(ProductTypeSchema.safeParse('brand').success).toBe(false);
  });
});

describe('ProductPresentationSchema', () => {
  it('validates full presentation', () => {
    const result = ProductPresentationSchema.safeParse({
      dosage: '500mg',
      quantity: 30,
      form: 'comprimido',
    });
    expect(result.success).toBe(true);
  });
  it('accepts partial presentation', () => {
    const result = ProductPresentationSchema.safeParse({
      dosage: '10mg',
    });
    expect(result.success).toBe(true);
  });
});

describe('EnrichedProductFindingSchema', () => {
  it('validates a finding with product classification', () => {
    const result = EnrichedProductFindingSchema.safeParse({
      product_name_mentioned: 'Rivotril 2mg',
      product_type: 'reference',
      laboratory: 'Roche',
      is_available: true,
      price: 45.90,
      price_currency: 'BRL',
      presentation: { dosage: '2mg', quantity: 30, form: 'comprimido' },
      notes: '',
    });
    expect(result.success).toBe(true);
  });

  it('validates a finding where pharmacy offered a generic instead', () => {
    const result = EnrichedProductFindingSchema.safeParse({
      product_name_mentioned: 'Clonazepam genérico',
      product_type: 'generic',
      laboratory: 'EMS',
      is_available: true,
      price: 12.50,
      price_currency: 'BRL',
      presentation: { dosage: '2mg', quantity: 30, form: 'comprimido' },
      notes: 'Oferecido como alternativa ao Rivotril',
    });
    expect(result.success).toBe(true);
  });

  it('validates a finding for a similar (branded generic)', () => {
    const result = EnrichedProductFindingSchema.safeParse({
      product_name_mentioned: 'Clopam 2mg',
      product_type: 'similar',
      laboratory: 'Cristália',
      is_available: true,
      price: 28.00,
      price_currency: 'BRL',
      presentation: { dosage: '2mg', quantity: 30, form: 'comprimido' },
      notes: 'Similar do Rivotril',
    });
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/elmogomes/Claude/e-conomic_integration/pharma-msa && npx vitest run packages/shared/src/__tests__/product-schemas.test.ts`
Expected: FAIL — schemas not found

**Step 3: Add Zod schemas to `packages/shared/src/schemas.ts`**

Append after the existing schemas:

```typescript
// ── Product Classification ──

export const ProductTypeSchema = z.enum(['reference', 'similar', 'generic']);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const ProductPresentationSchema = z.object({
  dosage: z.string().optional(),          // e.g. "500mg", "2mg/ml"
  quantity: z.number().optional(),        // e.g. 30 (comprimidos)
  form: z.string().optional(),            // e.g. "comprimido", "cápsula", "solução", "pomada"
});
export type ProductPresentation = z.infer<typeof ProductPresentationSchema>;

/** Enhanced product finding with product type classification */
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

/** Enhanced extractor result with classified products */
export const EnrichedExtractorResultSchema = z.object({
  reference_product: z.string(),          // the product we asked about
  findings: z.array(EnrichedProductFindingSchema),
  conversation_quality: z.enum(['complete', 'partial', 'poor']),
  pharmacy_responsiveness: z.enum(['cooperative', 'neutral', 'uncooperative']),
  pharmacy_asked_for_prescription: z.boolean().default(false),
  pharmacy_offered_delivery: z.boolean().default(false),
});
export type EnrichedExtractorResult = z.infer<typeof EnrichedExtractorResultSchema>;
```

**Step 4: Update Drizzle product schema**

```typescript
// packages/db/src/schema/products.ts
import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  activeIngredient: text('active_ingredient'),
  category: text('category'),
  brand: text('brand'),                    // laboratory/manufacturer
  dosage: text('dosage'),                  // e.g. "500mg"
  quantity: integer('quantity'),            // e.g. 30
  form: text('form'),                      // e.g. "comprimido"
  productType: text('product_type', {
    enum: ['reference', 'similar', 'generic'],
  }).notNull().default('reference'),
  referenceProductId: uuid('reference_product_id').references(() => products.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 5: Update product findings schema**

```typescript
// packages/db/src/schema/extractions.ts — update productFindings table
// Add these columns:
  productType: text('product_type', {
    enum: ['reference', 'similar', 'generic'],
  }),
  laboratory: text('laboratory'),
  dosageMentioned: text('dosage_mentioned'),
  quantityMentioned: integer('quantity_mentioned'),
  formMentioned: text('form_mentioned'),
```

**Step 6: Write the SQL migration**

```sql
-- packages/db/migrations/0008_product_classification.sql

-- Add product classification fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS form text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'reference'
  CHECK (product_type IN ('reference', 'similar', 'generic'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS reference_product_id uuid
  REFERENCES products(id) ON DELETE SET NULL;

-- Add product finding classification fields
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS product_type text
  CHECK (product_type IN ('reference', 'similar', 'generic'));
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS laboratory text;
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS dosage_mentioned text;
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS quantity_mentioned integer;
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS form_mentioned text;

-- Index for querying competitors of a reference product
CREATE INDEX IF NOT EXISTS idx_products_reference ON products(reference_product_id)
  WHERE reference_product_id IS NOT NULL;
```

**Step 7: Run tests and push migration**

Run: `npx vitest run packages/shared/src/__tests__/product-schemas.test.ts`
Expected: ALL PASS

Push migration to Supabase:
```bash
cd packages/db && npx drizzle-kit push
```

**Step 8: Commit**

```bash
git add packages/db/src/schema/products.ts packages/db/src/schema/extractions.ts \
  packages/db/migrations/0008_product_classification.sql \
  packages/shared/src/schemas.ts packages/shared/src/__tests__/product-schemas.test.ts
git commit -m "feat: enrich product model with reference/similar/generic classification"
```

---

## Task 2: Rule Engine Core — Match Rules and Matcher

**Files:**
- Create: `packages/shared/src/rules/types.ts`
- Create: `packages/shared/src/rules/matcher.ts`
- Test: `packages/shared/src/__tests__/matcher.test.ts`

The foundation — a rule engine that matches pharmacy messages against regex patterns with anti-patterns and confidence scores.

**Step 1: Write the failing tests**

```typescript
// packages/shared/src/__tests__/matcher.test.ts
import { describe, it, expect } from 'vitest';
import { matchRules, type MatchRule } from '../rules/matcher.js';

const AVAILABILITY_RULES: MatchRule[] = [
  {
    category: 'available',
    patterns: [/\btem\s+sim\b/i, /\btemos\b/i, /\bdispon[ií]vel/i, /\bem\s+estoque\b/i],
    antiPatterns: [/\bn[ãa]o\b/i, /\bfalta\b/i],
    confidence: 0.9,
  },
  {
    category: 'unavailable',
    patterns: [/\bn[ãa]o\s+tem(os)?\b/i, /\bacabou\b/i, /\bem\s+falta\b/i, /\bestamos\s+sem\b/i],
    confidence: 0.9,
  },
];

describe('matchRules', () => {
  it('matches "temos sim" as available', () => {
    const result = matchRules('Temos sim, pode vir buscar', AVAILABILITY_RULES);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('available');
    expect(result!.confidence).toBe(0.9);
  });

  it('matches "não temos" as unavailable', () => {
    const result = matchRules('Não temos esse no momento', AVAILABILITY_RULES);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('unavailable');
  });

  it('anti-pattern blocks false positive', () => {
    const result = matchRules('Não, temos outro similar', AVAILABILITY_RULES);
    expect(result?.category).not.toBe('available');
  });

  it('returns null for unrecognized messages', () => {
    expect(matchRules('Boa tarde, como posso ajudar?', AVAILABILITY_RULES)).toBeNull();
  });

  it('returns highest confidence match', () => {
    const rules: MatchRule[] = [
      { category: 'a', patterns: [/sim/i], confidence: 0.7 },
      { category: 'b', patterns: [/sim/i], confidence: 0.9 },
    ];
    expect(matchRules('sim', rules)!.category).toBe('b');
  });
});
```

**Step 2: Run test — expected FAIL**

**Step 3: Write types + matcher**

```typescript
// packages/shared/src/rules/types.ts
export interface MatchRule {
  category: string;
  patterns: RegExp[];
  antiPatterns?: RegExp[];
  confidence: number;
}

export interface MatchResult {
  category: string;
  confidence: number;
  matchedPattern: string;
  tier: 'rule';
}
```

```typescript
// packages/shared/src/rules/matcher.ts
import type { MatchRule, MatchResult } from './types.js';
export type { MatchRule, MatchResult } from './types.js';

export function matchRules(message: string, rules: MatchRule[]): MatchResult | null {
  const normalized = message.trim();
  let best: MatchResult | null = null;

  for (const rule of rules) {
    if (rule.antiPatterns?.some((ap) => ap.test(normalized))) continue;

    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        if (!best || rule.confidence > best.confidence) {
          best = {
            category: rule.category,
            confidence: rule.confidence,
            matchedPattern: pattern.source,
            tier: 'rule',
          };
        }
        break;
      }
    }
  }

  return best;
}
```

**Step 4: Run tests — expected ALL PASS**

**Step 5: Commit**

```bash
git add packages/shared/src/rules/ packages/shared/src/__tests__/matcher.test.ts
git commit -m "feat: add Tier 1 rule-based matcher engine"
```

---

## Task 3: Universal Pharmacy Rules + Personal Questions

**Files:**
- Create: `packages/shared/src/rules/pharmacy-rules.ts`
- Create: `packages/shared/src/rules/personal.ts`
- Test: `packages/shared/src/__tests__/pharmacy-rules.test.ts`
- Test: `packages/shared/src/__tests__/personal.test.ts`

Combined task: the universal PT-BR pharmacy ruleset (~75% of responses) plus personal question handler (name, CPF, recipe — zero AI cost).

**Step 1: Write both test files (see Task 2 and Task 3 from previous plan version for full test code)**

The pharmacy rules cover: `availability`, `price`, `generic`, `alternative`, `need_info` phases.

The personal handler detects: `name`, `cpf`, `recipe`, `address`, `phone` and responds with Persona-interpolated presets.

```typescript
// packages/shared/src/rules/personal.ts
export interface Persona {
  name: string;
  cpf?: string;
  neighborhood?: string;
  age?: number;
  backstory?: string;
}
export type PersonalQuestionType = 'name' | 'cpf' | 'recipe' | 'address' | 'phone';

export function detectPersonalQuestion(message: string): PersonalQuestionType | null { ... }
export function buildPersonalResponse(type: PersonalQuestionType, persona: Persona): string { ... }
```

(Full implementation in the pharmacy-rules.ts and personal.ts files from the previous plan version — identical code, omitting duplication here for brevity.)

**Step 2: Run tests — expected ALL PASS**

**Step 3: Commit**

```bash
git add packages/shared/src/rules/ packages/shared/src/__tests__/
git commit -m "feat: add PT-BR pharmacy rules + personal question handler"
```

---

## Task 4: Script Schema — Variants + Rule Overrides

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/__tests__/schemas.test.ts`

Add `variants` to `SendNodeSchema` and `rulePhase`/`customRules` to `ClassifyNodeSchema`. Backwards-compatible.

```typescript
// SendNodeSchema additions:
  variants: z.array(z.string()).optional(),

// ClassifyNodeSchema additions:
  rulePhase: z.string().optional(),
  customRules: z.array(z.object({
    category: z.string(),
    patterns: z.array(z.string()),    // regex strings for JSON serialization
    antiPatterns: z.array(z.string()).optional(),
    confidence: z.number(),
  })).optional(),
```

**Step 1: Tests (see previous plan Task 4 for full test code)**
**Step 2: Run — ALL PASS**
**Step 3: Export rules from `packages/shared/src/index.ts`**
**Step 4: Commit**

```bash
git commit -m "feat: extend script schemas with variants and rule overrides"
```

---

## Task 5: Message Variant Selector

**Files:**
- Modify: `apps/worker/src/engine/message-builder.ts`
- Test: `apps/worker/src/engine/__tests__/message-builder.test.ts`

Deterministic hash of `conversationId:nodeId` selects from `[message, ...variants]`. Same pharmacy always gets same variant per node; different pharmacies get different variants.

(Implementation identical to previous plan Task 5.)

```bash
git commit -m "feat: add deterministic message variant selector"
```

---

## Task 6: 3-Tier Classifier Orchestrator

**Files:**
- Create: `apps/worker/src/engine/classifier.ts`
- Test: `apps/worker/src/engine/__tests__/classifier.test.ts`

The `TieredClassifier` chains: Personal check → Tier 1 rules → Tier 2 Navigator (Haiku) → Tier 3 flag for Recovery (Sonnet).

(Implementation identical to previous plan Task 6.)

```bash
git commit -m "feat: add 3-tier classifier orchestrator"
```

---

## Task 7: Parse Worker + Script Runner Integration

**Files:**
- Modify: `apps/worker/src/workers/parse.worker.ts`
- Modify: `apps/worker/src/engine/script-runner.ts`

Replace direct `NavigatorAgent.classify()` with `TieredClassifier`. Handle personal questions with presets. Use `selectMessage()` for variants in `handleSendNode`.

(Implementation identical to previous plan Tasks 7-8.)

```bash
git commit -m "feat: integrate 3-tier classifier and variants into worker"
```

---

## Task 8: Standard Inquiry Script Template

**Files:**
- Create: `packages/shared/src/templates/standard-inquiry.ts`
- Test: `packages/shared/src/__tests__/standard-inquiry.test.ts`

Production-ready template with variants, rule phases, and the full inquiry flow covering: greeting → availability → price → generic → alternatives → next product → closing.

(Implementation identical to previous plan Task 9.)

```bash
git commit -m "feat: add standard pharmacy inquiry template"
```

---

## Task 9: Product Identifier Agent

**Files:**
- Create: `packages/ai/src/agents/product-identifier.ts`
- Create: `packages/ai/src/prompts/product-identifier.ts`
- Modify: `packages/shared/src/schemas.ts` (add `ProductIdentificationSchema`)
- Test: `packages/ai/src/__tests__/product-identifier.test.ts`

A mid-conversation agent (Haiku, ~$0.0002/call) that fires when the pharmacy mentions specific product names. It identifies:
- Whether the mentioned product is the reference, a known similar, a known generic, or an unknown product
- The laboratory/manufacturer if mentioned
- Presentation details (dosage, quantity, form) if mentioned
- Price if embedded in the response

This agent is called from the parse worker AFTER classification, when the category is `available`, `has_generic`, or `has_alternatives` — moments when the pharmacy is likely naming a specific product.

**Step 1: Write the failing tests**

```typescript
// packages/ai/src/__tests__/product-identifier.test.ts
import { describe, it, expect } from 'vitest';
import { ProductIdentificationSchema } from '@pharma/shared';

describe('ProductIdentificationSchema', () => {
  it('validates identification of a generic', () => {
    const result = ProductIdentificationSchema.safeParse({
      products_mentioned: [
        {
          name_as_mentioned: 'Clonazepam 2mg genérico EMS',
          product_type: 'generic',
          laboratory: 'EMS',
          presentation: { dosage: '2mg', quantity: null, form: 'comprimido' },
          price: 12.50,
          is_available: true,
        },
      ],
      confidence: 0.95,
      reasoning: 'Pharmacy offered unbranded Clonazepam (generic) from EMS laboratory',
    });
    expect(result.success).toBe(true);
    expect(result.data!.products_mentioned).toHaveLength(1);
    expect(result.data!.products_mentioned[0].product_type).toBe('generic');
  });

  it('validates multiple products in one response', () => {
    // Pharmacy says: "Não temos o Rivotril, mas temos o Clopam e o genérico"
    const result = ProductIdentificationSchema.safeParse({
      products_mentioned: [
        {
          name_as_mentioned: 'Rivotril',
          product_type: 'reference',
          laboratory: 'Roche',
          is_available: false,
        },
        {
          name_as_mentioned: 'Clopam',
          product_type: 'similar',
          laboratory: null,
          is_available: true,
        },
        {
          name_as_mentioned: 'genérico',
          product_type: 'generic',
          laboratory: null,
          is_available: true,
        },
      ],
      confidence: 0.85,
      reasoning: 'Pharmacy confirmed reference unavailable but offered similar and generic',
    });
    expect(result.success).toBe(true);
    expect(result.data!.products_mentioned).toHaveLength(3);
  });
});
```

**Step 2: Run test — expected FAIL**

**Step 3: Add Zod schema to `packages/shared/src/schemas.ts`**

```typescript
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
```

**Step 4: Write the Product Identifier prompt**

```typescript
// packages/ai/src/prompts/product-identifier.ts

export const PRODUCT_IDENTIFIER_SYSTEM_PROMPT = `Você é um especialista em produtos farmacêuticos brasileiros.

Sua tarefa é identificar e classificar TODOS os produtos farmacêuticos mencionados em uma resposta de farmácia.

CLASSIFICAÇÃO DE PRODUTOS:
- "reference" (Referência): O produto de marca original/inovador (ex: Rivotril, Amoxil, Novalgina)
- "similar" (Similar/Branded Generic): Cópia de marca — outro nome comercial, mesmo princípio ativo, outra empresa (ex: Clopam, Clonazepam-Cristália). Tem nome fantasia próprio.
- "generic" (Genérico): Produto SEM marca comercial, vendido pelo nome do princípio ativo + "Genérico" ou nome do lab genérico (ex: "Clonazepam Genérico EMS", "Amoxicilina Genérica"). A embalagem tem a tarja amarela com "G".

REGRAS:
1. Identifique TODOS os produtos mencionados na resposta, mesmo que sejam apenas citados de passagem
2. Se a farmácia diz "temos o genérico", classifique como "generic" mesmo sem nome específico
3. Se a farmácia diz "temos um similar", classifique como "similar"
4. Extraia o laboratório quando mencionado (ex: "EMS", "Medley", "Eurofarma" = genérico; "Cristália", "Aché" = pode ser similar)
5. Extraia preço quando mencionado (em BRL)
6. Extraia detalhes de apresentação (dosagem, quantidade, forma) quando mencionados
7. NUNCA invente informações — só extraia o que foi explicitamente dito
8. Se não tem certeza se é similar ou genérico, use o contexto: nome comercial próprio = similar; nome do princípio ativo = genérico`;

export function buildProductIdentifierMessages(
  pharmacyMessage: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  referenceProduct: {
    name: string;
    activeIngredient?: string;
    dosage?: string;
    brand?: string;
  },
  knownCompetitors?: { name: string; productType: string; laboratory?: string }[],
) {
  const historyText = conversationHistory
    .map((m) => `${m.role === 'assistant' ? 'CLIENTE' : 'FARMÁCIA'}: ${m.content}`)
    .join('\n');

  const competitorsText = knownCompetitors?.length
    ? `\nPRODUTOS CONCORRENTES CONHECIDOS:\n${knownCompetitors.map(
        (c) => `- ${c.name} (${c.productType}${c.laboratory ? `, lab: ${c.laboratory}` : ''})`,
      ).join('\n')}`
    : '';

  const userContent = `PRODUTO DE REFERÊNCIA: ${referenceProduct.name}
Princípio ativo: ${referenceProduct.activeIngredient ?? 'não informado'}
Dosagem: ${referenceProduct.dosage ?? 'não informada'}
Laboratório: ${referenceProduct.brand ?? 'não informado'}
${competitorsText}

HISTÓRICO DA CONVERSA:
${historyText}

ÚLTIMA RESPOSTA DA FARMÁCIA:
${pharmacyMessage}

Identifique e classifique TODOS os produtos farmacêuticos mencionados na resposta.`;

  return [{ role: 'user' as const, content: userContent }];
}

export const PRODUCT_IDENTIFIER_TOOL = {
  name: 'identify_products',
  description: 'Identifica e classifica produtos farmacêuticos mencionados pela farmácia',
  inputSchema: {
    type: 'object' as const,
    properties: {
      products_mentioned: {
        type: 'array' as const,
        description: 'Todos os produtos mencionados na resposta',
        items: {
          type: 'object' as const,
          properties: {
            name_as_mentioned: { type: 'string', description: 'Nome do produto exatamente como foi mencionado' },
            product_type: { type: 'string', enum: ['reference', 'similar', 'generic'], description: 'Classificação do produto' },
            laboratory: { type: 'string', description: 'Laboratório/fabricante se mencionado' },
            presentation: {
              type: 'object' as const,
              properties: {
                dosage: { type: 'string', description: 'Dosagem (ex: "2mg", "500mg")' },
                quantity: { type: 'number', description: 'Quantidade (ex: 30 comprimidos)' },
                form: { type: 'string', description: 'Forma farmacêutica (ex: "comprimido", "cápsula")' },
              },
            },
            price: { type: 'number', description: 'Preço em reais se mencionado' },
            is_available: { type: 'boolean', description: 'Se está disponível' },
          },
          required: ['name_as_mentioned', 'product_type'],
        },
      },
      confidence: { type: 'number', description: 'Confiança geral na identificação (0-1)' },
      reasoning: { type: 'string', description: 'Explicação da classificação' },
    },
    required: ['products_mentioned', 'confidence', 'reasoning'],
  },
};
```

**Step 5: Write the agent**

```typescript
// packages/ai/src/agents/product-identifier.ts
import type { LlmProvider, LlmMessage } from '../providers/types.js';
import { ProductIdentificationSchema, type ProductIdentification } from '@pharma/shared';
import {
  PRODUCT_IDENTIFIER_SYSTEM_PROMPT,
  buildProductIdentifierMessages,
  PRODUCT_IDENTIFIER_TOOL,
} from '../prompts/product-identifier.js';

export class ProductIdentifierAgent {
  constructor(private provider: LlmProvider) {}

  async identify(opts: {
    pharmacyMessage: string;
    conversationHistory: LlmMessage[];
    referenceProduct: {
      name: string;
      activeIngredient?: string;
      dosage?: string;
      brand?: string;
    };
    knownCompetitors?: { name: string; productType: string; laboratory?: string }[];
  }): Promise<ProductIdentification> {
    const messages = buildProductIdentifierMessages(
      opts.pharmacyMessage,
      opts.conversationHistory,
      opts.referenceProduct,
      opts.knownCompetitors,
    );

    const response = await this.provider.chat({
      system: PRODUCT_IDENTIFIER_SYSTEM_PROMPT,
      messages,
      tools: [PRODUCT_IDENTIFIER_TOOL],
      toolChoice: { type: 'tool', name: PRODUCT_IDENTIFIER_TOOL.name },
      temperature: 0,
      maxTokens: 1024,
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) throw new Error('ProductIdentifier returned no tool call');

    const parsed = ProductIdentificationSchema.safeParse(toolCall.input);
    if (!parsed.success) throw new Error(`ProductIdentifier validation failed: ${parsed.error.message}`);

    return parsed.data;
  }
}
```

**Step 6: Run tests — expected ALL PASS**

**Step 7: Commit**

```bash
git add packages/ai/src/agents/product-identifier.ts packages/ai/src/prompts/product-identifier.ts \
  packages/ai/src/__tests__/product-identifier.test.ts packages/shared/src/schemas.ts
git commit -m "feat: add Product Identifier agent for mid-conversation product classification"
```

---

## Task 10: Enhanced Extractor Agent

**Files:**
- Modify: `packages/ai/src/agents/extractor.ts`
- Modify: `packages/ai/src/prompts/extractor.ts`
- Test: `packages/ai/src/__tests__/extractor-enriched.test.ts`

Upgrade the Extractor to output `EnrichedExtractorResult` with product type classification, laboratory, presentation details, and conversation metadata (prescription asked, delivery offered).

**Step 1: Write the failing test**

```typescript
// packages/ai/src/__tests__/extractor-enriched.test.ts
import { describe, it, expect } from 'vitest';
import { EnrichedExtractorResultSchema } from '@pharma/shared';

describe('EnrichedExtractorResultSchema', () => {
  it('validates a complete extraction', () => {
    const result = EnrichedExtractorResultSchema.safeParse({
      reference_product: 'Rivotril 2mg 30 comprimidos',
      findings: [
        {
          product_name_mentioned: 'Rivotril 2mg',
          product_type: 'reference',
          laboratory: 'Roche',
          is_available: false,
          price: null,
          price_currency: 'BRL',
          notes: 'Indisponível',
        },
        {
          product_name_mentioned: 'Clonazepam 2mg Genérico EMS',
          product_type: 'generic',
          laboratory: 'EMS',
          is_available: true,
          price: 12.50,
          price_currency: 'BRL',
          presentation: { dosage: '2mg', quantity: 30, form: 'comprimido' },
          notes: 'Oferecido como alternativa',
        },
      ],
      conversation_quality: 'complete',
      pharmacy_responsiveness: 'cooperative',
      pharmacy_asked_for_prescription: true,
      pharmacy_offered_delivery: false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.findings).toHaveLength(2);
  });
});
```

**Step 2: Update `packages/ai/src/prompts/extractor.ts`**

```typescript
export const EXTRACTOR_SYSTEM_PROMPT = `Você é um analista especializado em produtos farmacêuticos brasileiros.
Sua tarefa é analisar conversas entre um mystery shopper e farmácias, extraindo dados estruturados sobre TODOS os produtos mencionados.

CLASSIFICAÇÃO DE PRODUTOS:
- "reference" (Referência): Produto original/inovador de marca (ex: Rivotril, Amoxil)
- "similar" (Similar): Cópia de marca — nome comercial próprio, mesmo princípio ativo, outro laboratório (ex: Clopam)
- "generic" (Genérico): Sem marca comercial, vendido pelo nome do princípio ativo (ex: "Clonazepam Genérico EMS")

REGRAS:
1. Extraia TODOS os produtos mencionados na conversa, classificando cada um
2. Capture o nome exatamente como foi mencionado pela farmácia
3. Identifique o laboratório/fabricante quando mencionado
4. Extraia preços EXATOS — nunca invente valores
5. Identifique detalhes de apresentação (dosagem, quantidade, forma) quando mencionados
6. Registre se a farmácia pediu receita/prescrição
7. Registre se a farmácia ofereceu entrega/delivery
8. Avalie a qualidade da conversa e cooperação da farmácia
9. Se um produto não foi discutido explicitamente, NÃO o inclua nos findings`;

// ... rest of updated extractor prompt with enriched tool schema
```

**Step 3: Update the `ExtractorAgent` to use `EnrichedExtractorResultSchema`**

**Step 4: Run tests — expected ALL PASS**

**Step 5: Commit**

```bash
git commit -m "feat: enhance extractor with product classification and presentation details"
```

---

## Task 11: Prompt Registry — DB-Backed Prompt Management

**Files:**
- Create: `packages/db/src/schema/prompts.ts`
- Create: `packages/db/migrations/0009_prompt_registry.sql`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/ai/src/agents/navigator.ts` (load prompts from DB)

Store all agent prompts in the database so they can be edited via the admin interface without redeploying.

**Step 1: Write the schema**

```typescript
// packages/db/src/schema/prompts.ts
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const agentPrompts = pgTable('agent_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentName: text('agent_name').notNull(),    // 'navigator', 'recovery', 'extractor', 'product_identifier', 'campaign_analyst'
  promptType: text('prompt_type').notNull(),   // 'system', 'tool_schema', 'user_template'
  content: text('content').notNull(),          // the prompt text or JSON
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<{
    description?: string;
    model?: string;           // recommended model for this agent
    temperature?: number;
    maxTokens?: number;
    lastEditedBy?: string;
    notes?: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const promptVersions = pgTable('prompt_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id').notNull().references(() => agentPrompts.id),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  changedBy: text('changed_by'),              // 'admin', 'prompt_manager_agent'
  changeReason: text('change_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 2: Write the SQL migration**

```sql
-- packages/db/migrations/0009_prompt_registry.sql

CREATE TABLE IF NOT EXISTS agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  prompt_type text NOT NULL,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_name, prompt_type, is_active) -- only one active version per agent+type
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES agent_prompts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content text NOT NULL,
  changed_by text,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompts_agent ON agent_prompts(agent_name) WHERE is_active = true;
CREATE INDEX idx_prompt_versions_prompt ON prompt_versions(prompt_id);
```

**Step 3: Create PromptLoader utility**

```typescript
// packages/ai/src/prompt-loader.ts
import type { Db } from '@pharma/db';
import { agentPrompts } from '@pharma/db';
import { eq, and } from 'drizzle-orm';

// In-memory cache with TTL
const cache = new Map<string, { content: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

export async function loadPrompt(
  db: Db,
  agentName: string,
  promptType: string,
  fallback: string,
): Promise<string> {
  const cacheKey = `${agentName}:${promptType}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.content;

  try {
    const [row] = await db
      .select({ content: agentPrompts.content })
      .from(agentPrompts)
      .where(
        and(
          eq(agentPrompts.agentName, agentName),
          eq(agentPrompts.promptType, promptType),
          eq(agentPrompts.isActive, true),
        ),
      )
      .limit(1);

    const content = row?.content ?? fallback;
    cache.set(cacheKey, { content, expiresAt: Date.now() + CACHE_TTL_MS });
    return content;
  } catch {
    return fallback;
  }
}

export function invalidatePromptCache(agentName?: string) {
  if (agentName) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${agentName}:`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}
```

**Step 4: Seed default prompts on startup**

Create a seeder that inserts the current hardcoded prompts as the initial version in the DB (INSERT ... ON CONFLICT DO NOTHING).

**Step 5: Update `NavigatorAgent` to load system prompt from DB (with fallback to hardcoded)**

**Step 6: Commit**

```bash
git commit -m "feat: add DB-backed prompt registry with versioning and caching"
```

---

## Task 12: Campaign Analyst Agent

**Files:**
- Create: `packages/ai/src/agents/campaign-analyst.ts`
- Create: `packages/ai/src/prompts/campaign-analyst.ts`
- Create: `packages/db/src/schema/reports.ts`
- Create: `apps/worker/src/workers/analyze.worker.ts`
- Modify: `packages/shared/src/schemas.ts` (add `CampaignReportSchema`)

A batch agent (Sonnet) that runs after all conversations in a campaign complete. It analyzes the aggregate data and produces a market intelligence report.

**Step 1: Add report schemas**

```typescript
// In packages/shared/src/schemas.ts

export const CampaignReportSchema = z.object({
  campaign_id: z.string(),
  reference_product: z.string(),
  total_pharmacies_contacted: z.number(),
  total_pharmacies_responded: z.number(),
  summary: z.object({
    // Reference product
    reference_availability_rate: z.number(),     // 0-1
    reference_avg_price: z.number().nullable(),
    reference_price_range: z.object({
      min: z.number().nullable(),
      max: z.number().nullable(),
    }),
    // Similares
    similares_found: z.array(z.object({
      name: z.string(),
      laboratory: z.string().nullable(),
      availability_rate: z.number(),
      avg_price: z.number().nullable(),
      pharmacies_offering: z.number(),
    })),
    // Generics
    generics_found: z.array(z.object({
      name: z.string(),
      laboratory: z.string().nullable(),
      availability_rate: z.number(),
      avg_price: z.number().nullable(),
      pharmacies_offering: z.number(),
    })),
    // Market insights
    prescription_required_rate: z.number(),    // how many pharmacies asked for prescription
    delivery_offered_rate: z.number(),
    avg_conversation_quality: z.string(),
    avg_pharmacy_responsiveness: z.string(),
  }),
  insights: z.array(z.string()),               // AI-generated market insights
  recommendations: z.array(z.string()),         // AI-generated recommendations
  generated_at: z.string(),
});
export type CampaignReport = z.infer<typeof CampaignReportSchema>;
```

**Step 2: Create reports DB table**

```typescript
// packages/db/src/schema/reports.ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import type { CampaignReport } from '@pharma/shared';

export const campaignReports = pgTable('campaign_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  report: jsonb('report').notNull().$type<CampaignReport>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 3: Write the Campaign Analyst prompt**

```typescript
// packages/ai/src/prompts/campaign-analyst.ts

export const CAMPAIGN_ANALYST_SYSTEM_PROMPT = `Você é um analista de inteligência de mercado farmacêutico brasileiro.

Sua tarefa é analisar os resultados de uma campanha de mystery shopping em farmácias e produzir um relatório de mercado.

Você receberá:
- O produto de referência que foi consultado
- Os dados estruturados de cada conversa (disponibilidade, preços, produtos alternativos oferecidos)

ANÁLISE ESPERADA:
1. Taxa de disponibilidade do produto de referência
2. Faixa de preço do referência (min, média, máx)
3. Quais similares (branded generics) foram oferecidos, por quantas farmácias, e a que preço
4. Quais genéricos foram oferecidos, por quantas farmácias, e a que preço
5. Competitividade de preço: como o referência se posiciona vs similares e genéricos
6. % de farmácias que exigiram receita/prescrição
7. % de farmácias que ofereceram entrega

INSIGHTS: Gere 3-5 insights estratégicos sobre o mercado baseados nos dados.
RECOMENDAÇÕES: Gere 2-3 recomendações acionáveis.

REGRAS:
- Base seus insights APENAS nos dados fornecidos
- Calcule métricas com precisão
- Use linguagem profissional em português
- Não invente dados — se não há informação suficiente, diga`;
```

**Step 4: Write the agent**

```typescript
// packages/ai/src/agents/campaign-analyst.ts
import type { LlmProvider, LlmMessage } from '../providers/types.js';
import { CampaignReportSchema, type CampaignReport, type EnrichedExtractorResult } from '@pharma/shared';
import { CAMPAIGN_ANALYST_SYSTEM_PROMPT } from '../prompts/campaign-analyst.js';

export class CampaignAnalystAgent {
  constructor(private provider: LlmProvider) {}

  async analyze(opts: {
    campaignId: string;
    referenceProduct: {
      name: string;
      activeIngredient?: string;
      dosage?: string;
      brand?: string;
    };
    extractions: {
      pharmacyName: string;
      result: EnrichedExtractorResult;
    }[];
  }): Promise<CampaignReport> {
    // Build the data summary for the AI
    const dataSummary = opts.extractions.map((e, i) => {
      const findings = e.result.findings.map((f) =>
        `  - ${f.product_name_mentioned} (${f.product_type}): ${f.is_available ? 'disponível' : 'indisponível'}${f.price ? `, R$ ${f.price.toFixed(2)}` : ''}${f.laboratory ? `, lab: ${f.laboratory}` : ''}`
      ).join('\n');
      return `Farmácia ${i + 1} (${e.pharmacyName}):
  Qualidade: ${e.result.conversation_quality}, Cooperação: ${e.result.pharmacy_responsiveness}
  Pediu receita: ${e.result.pharmacy_asked_for_prescription ? 'sim' : 'não'}
  Ofereceu entrega: ${e.result.pharmacy_offered_delivery ? 'sim' : 'não'}
  Produtos:
${findings}`;
    }).join('\n\n');

    const messages: LlmMessage[] = [{
      role: 'user',
      content: `PRODUTO DE REFERÊNCIA: ${opts.referenceProduct.name}
Princípio ativo: ${opts.referenceProduct.activeIngredient ?? 'N/A'}
Dosagem: ${opts.referenceProduct.dosage ?? 'N/A'}
Laboratório: ${opts.referenceProduct.brand ?? 'N/A'}

TOTAL DE FARMÁCIAS: ${opts.extractions.length}

DADOS DAS CONVERSAS:
${dataSummary}

Analise os dados e produza o relatório de mercado.`,
    }];

    const response = await this.provider.chat({
      system: CAMPAIGN_ANALYST_SYSTEM_PROMPT,
      messages,
      tools: [CAMPAIGN_ANALYST_TOOL],
      toolChoice: { type: 'tool', name: CAMPAIGN_ANALYST_TOOL.name },
      temperature: 0.2,
      maxTokens: 4096,
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) throw new Error('CampaignAnalyst returned no tool call');

    // Merge in the campaign_id and timestamp
    const raw = toolCall.input as Record<string, unknown>;
    raw.campaign_id = opts.campaignId;
    raw.generated_at = new Date().toISOString();

    const parsed = CampaignReportSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`CampaignAnalyst validation failed: ${parsed.error.message}`);

    return parsed.data;
  }
}

const CAMPAIGN_ANALYST_TOOL = {
  name: 'generate_report',
  description: 'Gera relatório de inteligência de mercado da campanha',
  inputSchema: {
    type: 'object' as const,
    properties: {
      reference_product: { type: 'string' },
      total_pharmacies_contacted: { type: 'number' },
      total_pharmacies_responded: { type: 'number' },
      summary: {
        type: 'object' as const,
        properties: {
          reference_availability_rate: { type: 'number' },
          reference_avg_price: { type: 'number' },
          reference_price_range: {
            type: 'object' as const,
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          similares_found: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' },
                laboratory: { type: 'string' },
                availability_rate: { type: 'number' },
                avg_price: { type: 'number' },
                pharmacies_offering: { type: 'number' },
              },
              required: ['name', 'availability_rate', 'pharmacies_offering'],
            },
          },
          generics_found: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' },
                laboratory: { type: 'string' },
                availability_rate: { type: 'number' },
                avg_price: { type: 'number' },
                pharmacies_offering: { type: 'number' },
              },
              required: ['name', 'availability_rate', 'pharmacies_offering'],
            },
          },
          prescription_required_rate: { type: 'number' },
          delivery_offered_rate: { type: 'number' },
          avg_conversation_quality: { type: 'string' },
          avg_pharmacy_responsiveness: { type: 'string' },
        },
        required: ['reference_availability_rate', 'similares_found', 'generics_found'],
      },
      insights: { type: 'array' as const, items: { type: 'string' } },
      recommendations: { type: 'array' as const, items: { type: 'string' } },
    },
    required: ['reference_product', 'total_pharmacies_contacted', 'total_pharmacies_responded', 'summary', 'insights', 'recommendations'],
  },
};
```

**Step 5: Write the analyze worker**

```typescript
// apps/worker/src/workers/analyze.worker.ts
// Triggered when a campaign transitions to 'completed'
// 1. Load all extraction_results for the campaign
// 2. Load the reference product + known competitors
// 3. Call CampaignAnalystAgent.analyze()
// 4. Store the report in campaign_reports table
// 5. Emit 'campaign_analyzed' event
```

**Step 6: Commit**

```bash
git commit -m "feat: add Campaign Analyst agent with market intelligence reporting"
```

---

## Task 13: Prompt Management API Routes

**Files:**
- Create: `apps/api/src/routes/prompts.ts`
- Create: `apps/api/src/routes/prompt-chat.ts`
- Modify: `apps/api/src/index.ts` (mount routes)

REST endpoints for CRUD on prompts + a chat endpoint where the admin can ask the Prompt Manager agent to help craft/improve prompts.

**Step 1: Write the CRUD routes**

```typescript
// apps/api/src/routes/prompts.ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { agentPrompts, promptVersions, type Db } from '@pharma/db';
import { invalidatePromptCache } from '@pharma/ai';

export function createPromptRoutes(db: Db) {
  const app = new Hono();

  // List all active prompts, grouped by agent
  app.get('/', async (c) => {
    const rows = await db.select().from(agentPrompts).where(eq(agentPrompts.isActive, true));
    const grouped = Object.groupBy(rows, (r) => r.agentName);
    return c.json(grouped);
  });

  // Get single prompt with version history
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const [prompt] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, id));
    if (!prompt) return c.json({ error: 'Not found' }, 404);

    const versions = await db.select().from(promptVersions)
      .where(eq(promptVersions.promptId, id))
      .orderBy(promptVersions.version);

    return c.json({ ...prompt, versions });
  });

  // Update a prompt (creates new version, bumps version number)
  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const { content, changeReason } = await c.req.json();

    const [current] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, id));
    if (!current) return c.json({ error: 'Not found' }, 404);

    const newVersion = current.version + 1;

    // Save old version
    await db.insert(promptVersions).values({
      promptId: id,
      version: current.version,
      content: current.content,
      changedBy: 'admin',
      changeReason: changeReason ?? `Updated to v${newVersion}`,
    });

    // Update current
    const [updated] = await db.update(agentPrompts).set({
      content,
      version: newVersion,
      updatedAt: new Date(),
    }).where(eq(agentPrompts.id, id)).returning();

    // Invalidate cache
    invalidatePromptCache(current.agentName);

    return c.json(updated);
  });

  // Revert to a previous version
  app.post('/:id/revert/:version', async (c) => {
    const id = c.req.param('id');
    const targetVersion = parseInt(c.req.param('version'));

    const [versionRow] = await db.select().from(promptVersions)
      .where(and(eq(promptVersions.promptId, id), eq(promptVersions.version, targetVersion)));

    if (!versionRow) return c.json({ error: 'Version not found' }, 404);

    // Save current as a version, then overwrite with target
    const [current] = await db.select().from(agentPrompts).where(eq(agentPrompts.id, id));
    if (!current) return c.json({ error: 'Prompt not found' }, 404);

    const newVersion = current.version + 1;

    await db.insert(promptVersions).values({
      promptId: id,
      version: current.version,
      content: current.content,
      changedBy: 'admin',
      changeReason: `Reverted to v${targetVersion}`,
    });

    const [updated] = await db.update(agentPrompts).set({
      content: versionRow.content,
      version: newVersion,
      updatedAt: new Date(),
    }).where(eq(agentPrompts.id, id)).returning();

    invalidatePromptCache(current.agentName);
    return c.json(updated);
  });

  return app;
}
```

**Step 2: Write the Prompt Manager chat endpoint**

```typescript
// apps/api/src/routes/prompt-chat.ts
import { Hono } from 'hono';
import type { Db } from '@pharma/db';
import type { LlmProvider } from '@pharma/ai';

export function createPromptChatRoutes(db: Db, provider: LlmProvider) {
  const app = new Hono();

  // Chat with the Prompt Manager — an AI that helps admins craft better prompts
  app.post('/', async (c) => {
    const { message, agentContext } = await c.req.json();

    // Load current prompts for context
    const currentPrompts = await db.select().from(agentPrompts)
      .where(eq(agentPrompts.isActive, true));

    const systemPrompt = `Você é o Prompt Manager do Pharma MSA — um sistema de mystery shopping em farmácias brasileiras.

Você ajuda o administrador a criar, melhorar e testar prompts para os agentes do sistema.

AGENTES DISPONÍVEIS:
- navigator: Classifica respostas da farmácia em categorias (usa Haiku, temperature 0)
- recovery: Gera respostas naturais quando a conversa sai do script (usa Sonnet, temperature 0.3)
- extractor: Analisa conversas completas e extrai dados de produtos (usa Sonnet, temperature 0)
- product_identifier: Identifica e classifica produtos mencionados pela farmácia (usa Haiku, temperature 0)
- campaign_analyst: Analisa todas as conversas de uma campanha e gera relatório (usa Sonnet, temperature 0.2)

PROMPTS ATUAIS:
${currentPrompts.map((p) => `### ${p.agentName} (${p.promptType}) v${p.version}:\n${p.content.slice(0, 500)}...`).join('\n\n')}

REGRAS:
1. Sempre escreva prompts em português brasileiro
2. Seja específico sobre o formato de saída esperado
3. Inclua exemplos quando possível
4. Considere edge cases do WhatsApp (áudios transcritos, abreviações, erros de digitação)
5. Quando sugerir mudanças, explique o PORQUÊ
6. Você pode sugerir testes — exemplos de entrada e saída esperada
7. Se o admin pedir para atualizar um prompt, forneça o texto completo pronto para uso`;

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
      temperature: 0.3,
      maxTokens: 4096,
    });

    return c.json({
      response: response.text,
      usage: response.usage,
    });
  });

  return app;
}
```

**Step 3: Mount routes in API**

```typescript
// In apps/api/src/index.ts, add:
import { createPromptRoutes } from './routes/prompts.js';
import { createPromptChatRoutes } from './routes/prompt-chat.js';

app.route('/prompts', createPromptRoutes(db));
app.route('/prompt-chat', createPromptChatRoutes(db, sonnetProvider));
```

**Step 4: Commit**

```bash
git commit -m "feat: add prompt management API with admin chat endpoint"
```

---

## Task 14: Dashboard — Prompt Management Page

**Files:**
- Create: `apps/dashboard/src/pages/PromptsPage.tsx`
- Modify: `apps/dashboard/src/lib/api.ts` (add prompt endpoints)
- Modify: `apps/dashboard/src/App.tsx` (add route)

Admin interface with:
1. Left sidebar: agents list
2. Center: prompt editor (monospace textarea with syntax highlighting for template variables)
3. Right: chat with Prompt Manager AI
4. Bottom: version history timeline

**Step 1: Add API types and endpoints**

```typescript
// In apps/dashboard/src/lib/api.ts, add:
  prompts: {
    list: () => request<Record<string, AgentPrompt[]>>('/prompts'),
    get: (id: string) => request<AgentPromptWithVersions>(`/prompts/${id}`),
    update: (id: string, data: { content: string; changeReason?: string }) =>
      request<AgentPrompt>(`/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    revert: (id: string, version: number) =>
      request<AgentPrompt>(`/prompts/${id}/revert/${version}`, { method: 'POST' }),
    chat: (message: string) =>
      request<{ response: string; usage: { inputTokens: number; outputTokens: number } }>(
        '/prompt-chat', { method: 'POST', body: JSON.stringify({ message }) },
      ),
  },

// Types:
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
```

**Step 2: Build the PromptsPage component**

Layout:
- Agent selector tabs (navigator, recovery, extractor, product_identifier, campaign_analyst)
- Prompt editor with Save + Revert buttons
- Version history accordion
- Chat panel (collapsible right drawer)

**Step 3: Add route to App.tsx**

```typescript
// In the router:
{ path: '/prompts', element: <PromptsPage /> }
// In the sidebar nav:
{ icon: MessageSquare, label: 'Prompts', path: '/prompts' }
```

**Step 4: Commit**

```bash
git commit -m "feat: add prompt management dashboard page with AI chat"
```

---

## Task 15: Campaign Reports API + Dashboard

**Files:**
- Create: `apps/api/src/routes/reports.ts`
- Modify: `apps/dashboard/src/pages/CampaignsPage.tsx` (add report view)
- Modify: `apps/dashboard/src/lib/api.ts` (add report endpoints)

**Step 1: Report routes**

```typescript
// apps/api/src/routes/reports.ts
app.get('/campaigns/:id/report', async (c) => {
  const campaignId = c.req.param('id');
  const [report] = await db.select().from(campaignReports)
    .where(eq(campaignReports.campaignId, campaignId))
    .orderBy(desc(campaignReports.createdAt))
    .limit(1);
  if (!report) return c.json({ error: 'No report yet' }, 404);
  return c.json(report);
});

// Trigger manual report generation
app.post('/campaigns/:id/analyze', async (c) => {
  const campaignId = c.req.param('id');
  await analyzeQueue.add('analyze', { campaignId });
  return c.json({ status: 'queued' });
});
```

**Step 2: Add report view to campaigns dashboard**

A report card showing:
- Reference product availability rate (big number)
- Price comparison table (reference vs similares vs generics)
- Pharmacy response breakdown (pie chart)
- AI-generated insights (bullet list)
- AI-generated recommendations (action cards)

**Step 3: Commit**

```bash
git commit -m "feat: add campaign reports API and dashboard view"
```

---

## Task 16: Wire Up, Build, and Deploy

**Step 1: Update exports in all packages**
**Step 2: Verify build**: `pnpm build`
**Step 3: Push and deploy all services**

```bash
git push origin main
# Deploy API
curl -s -X POST "http://157.180.67.154:8000/api/v1/deploy?uuid=iherfq1tsfneqh0we5iypci1&force=true" \
  -H "Authorization: Bearer 1|7Y3JV5XGjSGDP9ZiqDTeRTqXnMyD4dNr5mEDg2Xo19583777"
# Deploy Worker
curl -s -X POST "http://157.180.67.154:8000/api/v1/deploy?uuid=fhswze6e8yjhfokbvv9oey9r&force=true" \
  -H "Authorization: Bearer 1|7Y3JV5XGjSGDP9ZiqDTeRTqXnMyD4dNr5mEDg2Xo19583777"
# Deploy Dashboard
curl -s -X POST "http://157.180.67.154:8000/api/v1/deploy?uuid=j3k9w2rxgtr9yotmk225b8q6&force=true" \
  -H "Authorization: Bearer 1|7Y3JV5XGjSGDP9ZiqDTeRTqXnMyD4dNr5mEDg2Xo19583777"
```

---

## Agent Summary

| Agent | Model | Purpose | Cost/call | When |
|-------|-------|---------|-----------|------|
| **Navigator** | Haiku | Classify pharmacy response into branch | ~$0.0001 | Every inbound msg (Tier 2 fallback) |
| **Recovery** | Sonnet | Generate freeform response for off-script situations | ~$0.01 | ~5% of messages (Tier 3) |
| **Product Identifier** | Haiku | Recognize reference/similar/generic products mid-conversation | ~$0.0002 | When pharmacy mentions products |
| **Extractor** | Sonnet | Post-conversation structured data extraction with classification | ~$0.02 | Once per completed conversation |
| **Campaign Analyst** | Sonnet | Batch market intelligence across all campaign conversations | ~$0.05 | Once per completed campaign |
| **Prompt Manager** | Sonnet | Admin chat to help craft/improve/test agent prompts | ~$0.01 | On-demand via dashboard |

## Cost Projection (per 1000 conversations)

| Component | Old (all-AI) | New (3-tier + agents) | Savings |
|-----------|-------------|----------------------|---------|
| Classification | ~$150 | ~$15 (75% rules, 20% Haiku, 5% Sonnet) | 90% |
| Product ID | $0 (didn't exist) | ~$5 (Haiku, ~2 calls/conv) | N/A |
| Extraction | ~$50 | ~$20 (same Sonnet, richer output) | 60% |
| Campaign Analysis | $0 (didn't exist) | ~$0.05 (once per campaign) | N/A |
| Prompt Management | $0 (hardcoded) | ~$0.50 (on-demand admin use) | N/A |
| **TOTAL** | **~$200** | **~$40.55** | **~80%** |

## Data Flow: Campaign Lifecycle

```
1. SETUP
   Admin creates campaign:
   - Selects reference product (Rivotril 2mg 30cp, Roche)
   - System loads known similares/generics from products table
   - Assigns script template + pharmacy list + WhatsApp session

2. EXECUTION (per pharmacy)
   ┌─ Send greeting with {product_name} ──────────────────────┐
   │  "Olá! Vocês têm Rivotril 2mg 30 comprimidos?"           │
   │                                                           │
   │  Pharmacy responds ───▶ 3-Tier Classifier                │
   │    Tier 1: Rule match? ──▶ Branch                        │
   │    Tier 2: Haiku classify ──▶ Branch                     │
   │    Tier 3: Sonnet freeform ──▶ Recovery message           │
   │                                                           │
   │  When pharmacy mentions product:                          │
   │    ──▶ Product Identifier (Haiku)                        │
   │    Classify as reference/similar/generic                  │
   │    Store in conversation context                          │
   │                                                           │
   │  Flow: availability → price → generic → similar → next   │
   └───────────────────────────────────────────────────────────┘

3. EXTRACTION (per conversation)
   Full transcript ──▶ Enhanced Extractor (Sonnet)
   Output: classified findings with product_type, lab, presentation, price

4. ANALYSIS (per campaign)
   All extractions ──▶ Campaign Analyst (Sonnet)
   Output: market report with availability rates, price ranges,
           competitor landscape, insights, recommendations
```
