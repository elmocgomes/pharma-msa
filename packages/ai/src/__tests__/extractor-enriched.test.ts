import { describe, it, expect } from 'vitest';
import { EnrichedExtractorResultSchema } from '@pharma/shared';

describe('EnrichedExtractorResultSchema', () => {
  it('validates a complete extraction', () => {
    const result = EnrichedExtractorResultSchema.safeParse({
      reference_product: 'Rivotril 2mg 30 comprimidos',
      findings: [
        {
          product_name_mentioned: 'Rivotril 2mg',
          product_type: 'reference',
          laboratory: 'Roche',
          is_available: false,
          price: null,
          notes: 'Indisponível',
        },
        {
          product_name_mentioned: 'Clonazepam 2mg Genérico EMS',
          product_type: 'generic',
          laboratory: 'EMS',
          is_available: true,
          price: 12.50,
          presentation: { dosage: '2mg', quantity: 30, form: 'comprimido' },
          notes: 'Oferecido como alternativa',
        },
      ],
      conversation_quality: 'complete',
      pharmacy_responsiveness: 'cooperative',
      pharmacy_asked_for_prescription: true,
      pharmacy_offered_delivery: false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.findings).toHaveLength(2);
    expect(result.data!.pharmacy_asked_for_prescription).toBe(true);
  });

  it('validates minimal extraction', () => {
    const result = EnrichedExtractorResultSchema.safeParse({
      reference_product: 'Amoxil 500mg',
      findings: [],
      conversation_quality: 'poor',
      pharmacy_responsiveness: 'uncooperative',
      pharmacy_asked_for_prescription: false,
      pharmacy_offered_delivery: false,
    });
    expect(result.success).toBe(true);
  });

  it('validates finding with defaults', () => {
    const result = EnrichedExtractorResultSchema.safeParse({
      reference_product: 'Test',
      findings: [{
        product_name_mentioned: 'genérico',
        product_type: 'generic',
      }],
      conversation_quality: 'partial',
      pharmacy_responsiveness: 'neutral',
    });
    expect(result.success).toBe(true);
    expect(result.data!.findings[0].laboratory).toBeNull();
    expect(result.data!.findings[0].price).toBeNull();
  });
});
