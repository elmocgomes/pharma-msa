import type { MatchRule } from './types.js';

export const PHARMACY_RULES = {
  availability: [
    {
      category: 'available',
      patterns: [
        /\btem\s+sim\b/i,
        /\btemos\b(?!.*\bn[ãa]o\b)/i,
        /\bdispon[ií]vel/i,
        /\bem\s+estoque\b/i,
        /^sim[,.]?\s*(temos|tem|disponível)/i,
        /\bpode\s+vir\b/i,
        /\bquer\s+quant[ao]s?\b/i,
      ],
      antiPatterns: [/\bn[ãa]o\b.*\btemos\b/i, /\bn[ãa]o\s+tem/i, /\bfalta\b/i, /\bsem\b/i],
      confidence: 0.9,
    },
    {
      category: 'unavailable',
      patterns: [
        /\bn[ãa]o\s+tem(os)?\b/i,
        /\bacabou\b/i,
        /\bem\s+falta\b/i,
        /\bfora\s+de\s+estoque/i,
        /\bestamos\s+sem\b/i,
        /\bnao\s+tem\s+nao\b/i,
        /\binfelizmente\b/i,
        /\bno\s+momento\s+n[ãa]o/i,
      ],
      confidence: 0.9,
    },
  ] satisfies MatchRule[],

  price: [
    {
      category: 'price_given',
      patterns: [
        /R?\$\s*\d+[.,]?\d*/i,
        /\d+[.,]\d{2}\s*reais/i,
        /\d+\s*reais/i,
        /\bcusta\s+\d/i,
        /\bsai\s+(por|a)\s+\d/i,
        /\bvalor\s+[ée]\s+\d/i,
        /\bpre[çc]o\s+[ée]\s+\d/i,
      ],
      confidence: 0.85,
    },
    {
      category: 'no_price',
      patterns: [
        /\bn[ãa]o\s+informamos?\s+pre[çc]o/i,
        /\bn[ãa]o\s+passamos?\s+pre[çc]o/i,
        /\bpre[çc]o\s+s[óo]\s+(na\s+loja|presencial)/i,
        /\bvem\s+(na|à)\s+loja/i,
        /\bs[óo]\s+pessoalmente/i,
      ],
      confidence: 0.85,
    },
  ] satisfies MatchRule[],

  generic: [
    {
      category: 'has_generic',
      patterns: [
        /\btemos?\s+(o\s+)?gen[ée]rico/i,
        /\bgen[ée]rico\s+(tem|temos|sim|dispon)/i,
        /\bsim[,.]?\s*(o\s+)?gen[ée]rico/i,
        /\btem\s+sim[,.]?\s*(o\s+)?gen[ée]rico/i,
      ],
      antiPatterns: [/\bn[ãa]o\b/i, /\bsem\b/i],
      confidence: 0.85,
    },
    {
      category: 'no_generic',
      patterns: [
        /\bn[ãa]o\s+tem(os)?\s+(o\s+)?gen[ée]rico/i,
        /\bgen[ée]rico\s+n[ãa]o/i,
        /\bsem\s+gen[ée]rico/i,
        /\bs[óo]\s+(o\s+)?(original|refer[eê]ncia)/i,
      ],
      confidence: 0.85,
    },
  ] satisfies MatchRule[],

  alternative: [
    {
      category: 'has_alternatives',
      patterns: [
        /\btemos?\s+(um\s+)?similar/i,
        /\btem\s+(um\s+)?parecido/i,
        /\balternativa/i,
        /\bsubstituto/i,
        /\bmesmo\s+princ[ií]pio/i,
      ],
      antiPatterns: [/\bn[ãa]o\b/i],
      confidence: 0.8,
    },
    {
      category: 'nothing_available',
      patterns: [
        /\bn[ãa]o\s+tem(os)?\s+nada/i,
        /\bnenhum(a)?\s+alternativa/i,
        /\bnada\s+parecido/i,
        /\bn[ãa]o\s+temos\s+similar/i,
      ],
      confidence: 0.85,
    },
  ] satisfies MatchRule[],

  need_info: [
    {
      category: 'need_info',
      patterns: [
        /\bqual\s+(a\s+)?dosagem/i,
        /\bquantos?\s+mg/i,
        /\bqual\s+(a\s+)?marca/i,
        /\bqual\s+(o\s+)?laborat[óo]rio/i,
        /\bcomprimido\s+ou\s+c[áa]psula/i,
        /\btem\s+receita/i,
        /\bprecisa\s+de\s+receita/i,
      ],
      confidence: 0.85,
    },
  ] satisfies MatchRule[],
} as const;

export type PharmacyRulePhase = keyof typeof PHARMACY_RULES;
