export interface Persona {
  name: string;
  cpf?: string;
  neighborhood?: string;
  age?: number;
  backstory?: string;
}

export type PersonalQuestionType = 'name' | 'cpf' | 'recipe' | 'address' | 'phone';

const PERSONAL_PATTERNS: { type: PersonalQuestionType; patterns: RegExp[] }[] = [
  {
    type: 'name',
    patterns: [
      /\bqual\s+(o\s+)?(seu|teu)\s+nome\b/i,
      /\bcomo\s+(voc[eê]|vc)\s+se\s+chama\b/i,
      /\bquem\s+(est[áa]\s+)?fal(a|ando)\b/i,
      /\bnome\s+(do|da)\s+(cliente|paciente)\b/i,
      /\bpode\s+(me\s+)?informar\s+(o\s+)?nome/i,
      /\bem\s+nome\s+de\s+quem\b/i,
    ],
  },
  { type: 'cpf', patterns: [/\bcpf\b/i, /\bdocumento\b/i, /\bidentifica[çc][ãa]o\b/i] },
  { type: 'recipe', patterns: [/\breceita\b/i, /\bprescri[çc][ãa]o\b/i, /\bcontrola(do)?\b/i] },
  {
    type: 'address',
    patterns: [/\bonde\s+(voc[eê]|vc)\s+mora\b/i, /\bendere[çc]o\b/i, /\bqual\s+(sua|a)\s+localiza/i, /\bde\s+qual\s+bairro\b/i],
  },
  { type: 'phone', patterns: [/\btelefone\b/i, /\bcontato\b/i, /\bnumero\s+para\s+contato/i] },
];

export function detectPersonalQuestion(message: string): PersonalQuestionType | null {
  const normalized = message.trim();
  for (const { type, patterns } of PERSONAL_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) return type;
    }
  }
  return null;
}

const RESPONSE_TEMPLATES: Record<PersonalQuestionType, ((p: Persona) => string)[]> = {
  name: [(p) => `Meu nome é ${p.name}`, (p) => `É ${p.name}`, (p) => `${p.name}, prazer!`],
  cpf: [
    (p) => p.cpf ? `É ${p.cpf}` : 'No momento não tenho aqui comigo, consigo pegar depois',
    (p) => p.cpf ? `CPF: ${p.cpf}` : 'Ah, não estou com o documento aqui agora',
  ],
  recipe: [
    () => 'No momento não tenho receita, só queria verificar disponibilidade e preço',
    () => 'Não tenho a receita em mãos agora, é só para consultar o preço mesmo',
    () => 'Ainda vou ao médico, por enquanto queria saber se vocês têm e o valor',
  ],
  address: [
    (p) => p.neighborhood ? `Moro aqui perto, no ${p.neighborhood}` : 'Moro aqui perto',
    (p) => p.neighborhood ? `Sou do ${p.neighborhood}` : 'Sou aqui da região',
  ],
  phone: [() => 'Pode usar esse número mesmo do WhatsApp', () => 'Esse aqui mesmo que estou falando'],
};

export function buildPersonalResponse(questionType: PersonalQuestionType, persona: Persona): string {
  const templates = RESPONSE_TEMPLATES[questionType];
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx]!(persona);
}
