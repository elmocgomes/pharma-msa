import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { type Db, agentPrompts } from '@pharma/db';
import type { LlmProvider } from '@pharma/ai';

export function createPromptChatRoutes(db: Db, provider: LlmProvider) {
  const app = new Hono();

  app.post('/', async (c) => {
    const { message } = await c.req.json();

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
${currentPrompts.map((p) => `### ${p.agentName} (${p.promptType}) v${p.version}:\n${p.content.slice(0, 500)}${p.content.length > 500 ? '...' : ''}`).join('\n\n')}

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
