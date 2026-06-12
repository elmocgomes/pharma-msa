import { describe, it, expect } from 'vitest';
import { matchRules } from '../rules/matcher.js';
import { PHARMACY_RULES } from '../rules/pharmacy-rules.js';

describe('PHARMACY_RULES.availability', () => {
  const rules = PHARMACY_RULES.availability;
  const available = ['Temos sim', 'Sim, temos em estoque', 'tem sim, disponível', 'Temos, quer quantas caixas?', 'Disponível sim'];
  const unavailable = ['Não temos', 'Infelizmente acabou', 'Estamos sem esse produto', 'Em falta no momento', 'nao tem nao'];
  for (const p of available) it(`"${p}" → available`, () => expect(matchRules(p, rules)?.category).toBe('available'));
  for (const p of unavailable) it(`"${p}" → unavailable`, () => expect(matchRules(p, rules)?.category).toBe('unavailable'));
});

describe('PHARMACY_RULES.price', () => {
  const rules = PHARMACY_RULES.price;
  it('"R$ 45,90" → price_given', () => expect(matchRules('Custa R$ 45,90', rules)?.category).toBe('price_given'));
  it('"89 reais" → price_given', () => expect(matchRules('Sai por 89 reais', rules)?.category).toBe('price_given'));
  it('no_price', () => expect(matchRules('Não informamos preço pelo WhatsApp', rules)?.category).toBe('no_price'));
});

describe('PHARMACY_RULES.generic', () => {
  const rules = PHARMACY_RULES.generic;
  it('"temos o genérico" → has_generic', () => expect(matchRules('Sim, temos o genérico', rules)?.category).toBe('has_generic'));
  it('"não temos genérico" → no_generic', () => expect(matchRules('Genérico não temos não', rules)?.category).toBe('no_generic'));
});

describe('PHARMACY_RULES.alternative', () => {
  const rules = PHARMACY_RULES.alternative;
  it('"temos um similar" → has_alternatives', () => expect(matchRules('Temos um similar, quer saber o nome?', rules)?.category).toBe('has_alternatives'));
  it('"não temos nada" → nothing_available', () => expect(matchRules('Infelizmente não temos nada parecido', rules)?.category).toBe('nothing_available'));
});

describe('PHARMACY_RULES.need_info', () => {
  const rules = PHARMACY_RULES.need_info;
  it('"qual a dosagem?" → need_info', () => expect(matchRules('Qual a dosagem que você precisa?', rules)?.category).toBe('need_info'));
  it('"qual marca?" → need_info', () => expect(matchRules('Qual marca?', rules)?.category).toBe('need_info'));
});
