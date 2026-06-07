export function buildRecoverySystemPrompt(persona: {
  name: string;
  cpf?: string;
  details?: Record<string, unknown>;
}) {
  const personalInfo = [
    `Seu nome é ${persona.name}.`,
    persona.cpf ? `Seu CPF é ${persona.cpf}.` : '',
    persona.details?.age ? `Você tem ${persona.details.age} anos.` : '',
    persona.details?.neighborhood ? `Mora no bairro ${persona.details.neighborhood}.` : '',
    persona.details?.backstory ? String(persona.details.backstory) : '',
  ].filter(Boolean).join(' ');

  return `Você é um(a) cliente brasileiro(a) conversando com uma farmácia pelo WhatsApp.
${personalInfo}

Sua tarefa é manter a conversa fluindo naturalmente quando a farmácia responde algo inesperado ou faz perguntas pessoais.

REGRAS:
1. Responda de forma NATURAL e EDUCADA em português brasileiro coloquial
2. Se perguntarem seu nome, CPF, ou dados pessoais, responda com as informações acima
3. Após responder uma pergunta pessoal, redirecione educadamente para o assunto principal
4. Se a farmácia claramente não quer continuar a conversa (rude, bloqueia, pede para parar), retorne should_retry: false
5. Mantenha as respostas CURTAS — como uma pessoa real mandaria por WhatsApp (1-2 frases no máximo)
6. Use linguagem informal brasileira natural (pode usar "vc", "tb", "blz", etc. ocasionalmente)
7. NUNCA mencione que você é um robô, IA, ou sistema automatizado`;
}

export function buildRecoveryMessages(
  pharmacyMessage: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  currentIntent: string,
) {
  const userContent = `A FARMÁCIA RESPONDEU ALGO INESPERADO.

INTENÇÃO ATUAL DO ROTEIRO: ${currentIntent}

HISTÓRICO DA CONVERSA:
${conversationHistory.map((m) => `${m.role === 'assistant' ? 'EU' : 'FARMÁCIA'}: ${m.content}`).join('\n')}

ÚLTIMA MENSAGEM DA FARMÁCIA:
${pharmacyMessage}

Gere uma resposta natural que resolva o que a farmácia disse e tente retomar o assunto do roteiro.`;

  return [{ role: 'user' as const, content: userContent }];
}

export const RECOVERY_TOOL = {
  name: 'recovery_response',
  description: 'Gera uma resposta de recuperação para manter a conversa',
  inputSchema: {
    type: 'object' as const,
    properties: {
      message: {
        type: 'string',
        description: 'A mensagem para enviar à farmácia',
      },
      should_retry: {
        type: 'boolean',
        description: 'Se devemos continuar tentando a conversa (false = desistir)',
      },
    },
    required: ['message', 'should_retry'],
  },
};
