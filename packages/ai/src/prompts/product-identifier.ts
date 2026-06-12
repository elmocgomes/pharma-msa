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
        type: 'array',
        description: 'Todos os produtos mencionados na resposta',
        items: {
          type: 'object',
          properties: {
            name_as_mentioned: { type: 'string', description: 'Nome do produto exatamente como foi mencionado' },
            product_type: { type: 'string', enum: ['reference', 'similar', 'generic'], description: 'Classificação do produto' },
            laboratory: { type: 'string', description: 'Laboratório/fabricante se mencionado' },
            presentation: {
              type: 'object',
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
