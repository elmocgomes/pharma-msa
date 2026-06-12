import { describe, it, expect } from 'vitest';
import { detectPersonalQuestion, buildPersonalResponse, type Persona } from '../rules/personal.js';

const persona: Persona = { name: 'Maria Silva', cpf: '123.456.789-00', neighborhood: 'Copacabana', age: 35 };

describe('detectPersonalQuestion', () => {
  it('detects "qual seu nome?"', () => expect(detectPersonalQuestion('Qual seu nome?')).toBe('name'));
  it('detects "como se chama"', () => expect(detectPersonalQuestion('Como você se chama?')).toBe('name'));
  it('detects CPF request', () => expect(detectPersonalQuestion('Preciso do CPF para cadastro')).toBe('cpf'));
  it('detects recipe question', () => expect(detectPersonalQuestion('Tem receita médica?')).toBe('recipe'));
  it('detects "quem está falando"', () => expect(detectPersonalQuestion('Quem está falando?')).toBe('name'));
  it('returns null for non-personal', () => expect(detectPersonalQuestion('Temos sim, R$ 45')).toBeNull());
  it('detects address', () => expect(detectPersonalQuestion('Onde você mora?')).toBe('address'));
});

describe('buildPersonalResponse', () => {
  it('responds with name', () => expect(buildPersonalResponse('name', persona)).toContain('Maria Silva'));
  it('responds with CPF', () => expect(buildPersonalResponse('cpf', persona)).toContain('123.456.789-00'));
  it('responds about recipe', () => expect(buildPersonalResponse('recipe', persona).toLowerCase()).toContain('receita'));
  it('responds with neighborhood', () => expect(buildPersonalResponse('address', persona)).toContain('Copacabana'));
  it('handles missing CPF', () => {
    const minimal: Persona = { name: 'João' };
    const r = buildPersonalResponse('cpf', minimal);
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});
