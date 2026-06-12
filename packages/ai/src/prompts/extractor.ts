export const EXTRACTOR_SYSTEM_PROMPT = `Você é um analista que extrai dados estruturados de conversas entre um cliente e uma farmácia via WhatsApp.

Sua tarefa é analisar a conversa completa e extrair informações sobre cada produto farmacêutico discutido.

REGRAS:
1. Extraia APENAS informações explicitamente mencionadas na conversa
2. NUNCA invente preços, disponibilidade, ou nomes de produtos
3. Se um preço foi mencionado, extraia o valor numérico (ex: "R$ 45,90" → 45.90)
4. Se a disponibilidade não ficou clara, use null
5. Genéricos e alternativas devem ser listados separadamente
6. Avalie a qualidade geral da conversa (completa, parcial, ou pobre)
7. Avalie a cooperação da farmácia (cooperativa, neutra, ou não cooperativa)`;

export function buildExtractorMessages(
  conversationTranscript: { role: 'user' | 'assistant'; content: string }[],
  productNames: string[],
) {
  const transcript = conversationTranscript
    .map((m) => `${m.role === 'assistant' ? 'CLIENTE' : 'FARMÁCIA'}: ${m.content}`)
    .join('\n');

  const userContent = `PRODUTOS CONSULTADOS: ${productNames.join(', ')}

TRANSCRIÇÃO COMPLETA DA CONVERSA:
${transcript}

Analise a conversa e extraia os dados estruturados sobre cada produto.`;

  return [{ role: 'user' as const, content: userContent }];
}

export const ENRICHED_EXTRACTOR_SYSTEM_PROMPT = `Você é um analista especializado em produtos farmacêuticos brasileiros.
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

export function buildEnrichedExtractorMessages(
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  referenceProduct: string,
  campaignProducts?: string[],
) {
  const transcript = conversationHistory
    .map((m) => `${m.role === 'assistant' ? 'MYSTERY SHOPPER' : 'FARMÁCIA'}: ${m.content}`)
    .join('\n');

  const productsContext = campaignProducts?.length
    ? `\nPRODUTOS DA CAMPANHA: ${campaignProducts.join(', ')}`
    : '';

  const userContent = `PRODUTO DE REFERÊNCIA: ${referenceProduct}
${productsContext}

TRANSCRIÇÃO COMPLETA DA CONVERSA:
${transcript}

Analise a conversa e extraia todos os dados estruturados.`;

  return [{ role: 'user' as const, content: userContent }];
}

export const ENRICHED_EXTRACTOR_TOOL = {
  name: 'enriched_extraction',
  description: 'Extrai dados estruturados enriquecidos de uma conversa com farmácia',
  inputSchema: {
    type: 'object' as const,
    properties: {
      reference_product: { type: 'string', description: 'Nome do produto de referência da campanha' },
      findings: {
        type: 'array',
        description: 'Dados de cada produto mencionado na conversa',
        items: {
          type: 'object',
          properties: {
            product_name_mentioned: { type: 'string', description: 'Nome como mencionado pela farmácia' },
            product_type: { type: 'string', enum: ['reference', 'similar', 'generic'] },
            laboratory: { type: 'string', description: 'Laboratório/fabricante' },
            is_available: { type: 'boolean' },
            price: { type: 'number', description: 'Preço em BRL' },
            price_currency: { type: 'string', default: 'BRL' },
            presentation: {
              type: 'object',
              properties: {
                dosage: { type: 'string' },
                quantity: { type: 'number' },
                form: { type: 'string' },
              },
            },
            notes: { type: 'string' },
          },
          required: ['product_name_mentioned', 'product_type'],
        },
      },
      conversation_quality: { type: 'string', enum: ['complete', 'partial', 'poor'] },
      pharmacy_responsiveness: { type: 'string', enum: ['cooperative', 'neutral', 'uncooperative'] },
      pharmacy_asked_for_prescription: { type: 'boolean' },
      pharmacy_offered_delivery: { type: 'boolean' },
    },
    required: ['reference_product', 'findings', 'conversation_quality', 'pharmacy_responsiveness', 'pharmacy_asked_for_prescription', 'pharmacy_offered_delivery'],
  },
};

export const EXTRACTOR_TOOL = {
  name: 'extract_data',
  description: 'Extrai dados estruturados da conversa com a farmácia',
  inputSchema: {
    type: 'object' as const,
    properties: {
      products: {
        type: 'array' as const,
        description: 'Dados extraídos de cada produto',
        items: {
          type: 'object' as const,
          properties: {
            product_name: { type: 'string', description: 'Nome do produto como mencionado' },
            is_available: { type: 'boolean', description: 'Se o produto está disponível' },
            price: { type: 'number', description: 'Preço em reais (ex: 45.90)' },
            price_currency: { type: 'string', default: 'BRL' },
            has_generic: { type: 'boolean', description: 'Se tem versão genérica' },
            generic_names: { type: 'array' as const, items: { type: 'string' }, description: 'Nomes dos genéricos mencionados' },
            generic_prices: { type: 'array' as const, items: { type: 'number' }, description: 'Preços dos genéricos' },
            alternative_names: { type: 'array' as const, items: { type: 'string' }, description: 'Nomes de alternativas/similares' },
            notes: { type: 'string', description: 'Observações adicionais' },
          },
          required: ['product_name'],
        },
      },
      conversation_quality: {
        type: 'string',
        enum: ['complete', 'partial', 'poor'],
        description: 'Qualidade geral da conversa',
      },
      pharmacy_responsiveness: {
        type: 'string',
        enum: ['cooperative', 'neutral', 'uncooperative'],
        description: 'Nível de cooperação da farmácia',
      },
    },
    required: ['products', 'conversation_quality', 'pharmacy_responsiveness'],
  },
};
