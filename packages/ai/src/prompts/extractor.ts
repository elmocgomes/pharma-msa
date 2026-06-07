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
