export const NAVIGATOR_SYSTEM_PROMPT = `Você é um classificador de respostas de farmácias em conversas via WhatsApp.

Sua tarefa é analisar a resposta da farmácia e classificá-la em uma das categorias fornecidas.

REGRAS:
1. Analise a mensagem da farmácia no contexto da conversa e da intenção atual
2. Considere abreviações comuns em WhatsApp brasileiro (vc, tb, qto, pq, etc.)
3. Considere respostas por áudio transcritas (podem ter erros de transcrição)
4. Se a farmácia está fazendo uma pergunta pessoal (nome, CPF, endereço, quem é você), marque is_personal_question como true
5. Se a resposta não se encaixa claramente em nenhuma categoria, use a que mais se aproxima mas com confidence baixa
6. Nunca invente informações — classifique apenas com base no que foi dito
7. confidence vai de 0.0 a 1.0 onde 1.0 = certeza absoluta`;

export function buildNavigatorMessages(
  pharmacyMessage: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  intent: string,
  branchDescriptions: { category: string; description: string }[],
) {
  const branchList = branchDescriptions
    .map((b) => `- "${b.category}": ${b.description}`)
    .join('\n');

  const userContent = `INTENÇÃO ATUAL: ${intent}

CATEGORIAS POSSÍVEIS:
${branchList}

HISTÓRICO RECENTE DA CONVERSA:
${conversationHistory.map((m) => `${m.role === 'assistant' ? 'EU' : 'FARMÁCIA'}: ${m.content}`).join('\n')}

ÚLTIMA RESPOSTA DA FARMÁCIA:
${pharmacyMessage}

Classifique a resposta da farmácia em uma das categorias acima.`;

  return [{ role: 'user' as const, content: userContent }];
}

export function buildNavigatorTool(validCategories: string[]) {
  return {
    name: 'classify_response',
    description: 'Classifica a resposta da farmácia em uma categoria',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: validCategories,
          description: 'A categoria que melhor descreve a resposta da farmácia',
        },
        confidence: {
          type: 'number',
          description: 'Nível de confiança de 0.0 a 1.0',
        },
        reasoning: {
          type: 'string',
          description: 'Breve explicação da classificação',
        },
        is_personal_question: {
          type: 'boolean',
          description: 'Se a farmácia está fazendo uma pergunta pessoal (nome, CPF, etc.)',
        },
      },
      required: ['category', 'confidence', 'reasoning', 'is_personal_question'],
    },
  };
}
