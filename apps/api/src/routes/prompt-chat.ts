import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { type Db, agentPrompts, promptVersions } from '@pharma/db';
import type { LlmProvider, LlmToolDefinition, LlmMessage } from '@pharma/ai';
import { invalidatePromptCache } from '@pharma/ai';

const UPDATE_PROMPT_TOOL: LlmToolDefinition = {
  name: 'update_prompt',
  description: 'Update the content of an agent prompt. Use this when the admin asks you to change, improve, or replace a prompt. Always show the full new prompt to the admin and get confirmation before calling this tool.',
  inputSchema: {
    type: 'object',
    properties: {
      agent_name: {
        type: 'string',
        description: 'The agent name (e.g., navigator, recovery, extractor, product_identifier, campaign_analyst)',
      },
      prompt_type: {
        type: 'string',
        description: 'The prompt type (e.g., system)',
      },
      new_content: {
        type: 'string',
        description: 'The complete new prompt content',
      },
      change_reason: {
        type: 'string',
        description: 'Brief reason for the change',
      },
    },
    required: ['agent_name', 'prompt_type', 'new_content', 'change_reason'],
  },
};

const LIST_PROMPTS_TOOL: LlmToolDefinition = {
  name: 'list_prompts',
  description: 'List all active agent prompts with their full content. Use this to see the current state of all prompts.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export function createPromptChatRoutes(db: Db, provider: LlmProvider) {
  const app = new Hono();

  app.post('/', async (c) => {
    const { message, messages: incomingHistory } = await c.req.json();

    const currentPrompts = await db.select().from(agentPrompts)
      .where(eq(agentPrompts.isActive, true));

    const systemPrompt = `Você é o Prompt Manager do Pharma MSA — um sistema de mystery shopping em farmácias brasileiras via WhatsApp.

Você ajuda o administrador a criar, melhorar e testar prompts para os agentes do sistema.

AGENTES DISPONÍVEIS:
- navigator: Classifica respostas da farmácia em categorias (usa Haiku, temperature 0)
- recovery: Gera respostas naturais quando a conversa sai do script (usa Sonnet, temperature 0.3)
- extractor: Analisa conversas completas e extrai dados de produtos (usa Sonnet, temperature 0)
- product_identifier: Identifica e classifica produtos mencionados pela farmácia (usa Haiku, temperature 0)
- campaign_analyst: Analisa todas as conversas de uma campanha e gera relatório (usa Sonnet, temperature 0.2)

PROMPTS ATUAIS:
${currentPrompts.map((p) => `### ${p.agentName} (${p.promptType}) v${p.version}:\n${p.content}`).join('\n\n')}

REGRAS:
1. Sempre escreva prompts em português brasileiro
2. Seja específico sobre o formato de saída esperado
3. Inclua exemplos quando possível
4. Considere edge cases do WhatsApp (áudios transcritos, abreviações, erros de digitação)
5. Quando sugerir mudanças, explique o PORQUÊ
6. Você pode sugerir testes — exemplos de entrada e saída esperada
7. Quando o admin pedir para atualizar um prompt, use a tool update_prompt para aplicar a mudança
8. Antes de atualizar, mostre o prompt completo ao admin e peça confirmação, A NÃO SER que ele tenha explicitamente pedido para aplicar diretamente
9. Quando quiser ver o estado atual dos prompts, use a tool list_prompts`;

    const history: LlmMessage[] = Array.isArray(incomingHistory) && incomingHistory.length > 0
      ? [...incomingHistory, { role: 'user' as const, content: message }]
      : [{ role: 'user' as const, content: message }];

    const response = await provider.chat({
      system: systemPrompt,
      messages: history,
      tools: [UPDATE_PROMPT_TOOL, LIST_PROMPTS_TOOL],
      temperature: 0.3,
      maxTokens: 4096,
    });

    const toolResults: string[] = [];

    for (const tc of response.toolCalls) {
      if (tc.name === 'update_prompt') {
        const { agent_name, prompt_type, new_content, change_reason } = tc.input as {
          agent_name: string;
          prompt_type: string;
          new_content: string;
          change_reason: string;
        };

        const [current] = await db.select().from(agentPrompts)
          .where(eq(agentPrompts.agentName, agent_name));

        if (!current) {
          toolResults.push(`❌ Agent "${agent_name}" não encontrado.`);
          continue;
        }

        const newVersion = current.version + 1;

        await db.insert(promptVersions).values({
          promptId: current.id,
          version: current.version,
          content: current.content,
          changedBy: 'prompt-manager-ai',
          changeReason: change_reason,
        });

        await db.update(agentPrompts).set({
          content: new_content,
          version: newVersion,
          updatedAt: new Date(),
        }).where(eq(agentPrompts.id, current.id));

        invalidatePromptCache(agent_name);
        toolResults.push(`✅ Prompt do agent "${agent_name}" (${prompt_type}) atualizado para v${newVersion}. Motivo: ${change_reason}`);
      } else if (tc.name === 'list_prompts') {
        const prompts = await db.select().from(agentPrompts)
          .where(eq(agentPrompts.isActive, true));
        toolResults.push(prompts.map((p) =>
          `**${p.agentName}** (${p.promptType}) v${p.version}:\n${p.content.slice(0, 300)}${p.content.length > 300 ? '...' : ''}`
        ).join('\n\n'));
      }
    }

    let fullResponse = response.text ?? '';
    if (toolResults.length > 0) {
      fullResponse = toolResults.join('\n\n') + (fullResponse ? '\n\n' + fullResponse : '');
    }

    return c.json({
      response: fullResponse,
      toolsUsed: response.toolCalls.map((tc) => tc.name),
      usage: response.usage,
    });
  });

  return app;
}
