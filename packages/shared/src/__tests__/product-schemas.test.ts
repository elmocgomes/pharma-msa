import { describe, it, expect } from 'vitest';
import { ProductTypeSchema, ProductPresentationSchema, EnrichedProductFindingSchema, EnrichedExtractorResultSchema, ProductIdentificationSchema } from '../schemas.js';

describe('ProductTypeSchema', () => {
  it('accepts reference', () => expect(ProductTypeSchema.safeParse('reference').success).toBe(true));
  it('accepts similar', () => expect(ProductTypeSchema.safeParse('similar').success).toBe(true));
  it('accepts generic', () => expect(ProductTypeSchema.safeParse('generic').success).toBe(true));
  it('rejects unknown', () => expect(ProductTypeSchema.safeParse('brand').success).toBe(false));
});

describe('ProductPresentationSchema', () => {
  it('validates full presentation', () => {
    const result = ProductPresentationSchema.safeParse({ dosage: '500mg', quantity: 30, form: 'comprimido' });
    expect(result.success).toBe(true);
  });
  it('accepts partial', () => {
    expect(ProductPresentationSchema.safeParse({ dosage: '10mg' }).success).toBe(true);
  });
});

describe('EnrichedProductFindingSchema', () => {
  it('validates a reference product finding', () => {
    const result = EnrichedProductFindingSchema.safeParse({
      product_name_mentioned: 'Rivotril 2mg',
      product_type: 'reference',
      laboratory: 'Roche',
      is_available: true,
      price: 45.90,
      presentation: { dosage: '2mg', quantity: 30, form: 'comprimido' },
    });
    expect(result.success).toBe(true);
  });

  it('validates a generic finding', () => {
    const result = EnrichedProductFindingSchema.safeParse({
      product_name_mentioned: 'Clonazepam genérico EMS',
      product_type: 'generic',
      laboratory: 'EMS',
      is_available: true,
      price: 12.50,
    });
    expect(result.success).toBe(true);
  });

  it('validates a similar (branded generic) finding', () => {
    const result = EnrichedProductFindingSchema.safeParse({
      product_name_mentioned: 'Clopam 2mg',
      product_type: 'similar',
      laboratory: 'Cristália',
      is_available: true,
      price: 28.00,
    });
    expect(result.success).toBe(true);
  });
});

describe('EnrichedExtractorResultSchema', () => {
  it('validates a complete extraction', () => {
    const result = EnrichedExtractorResultSchema.safeParse({
      reference_product: 'Rivotril 2mg 30 comprimidos',
      findings: [
        { product_name_mentioned: 'Rivotril 2mg', product_type: 'reference', is_available: false },
        { product_name_mentioned: 'Clonazepam Genérico', product_type: 'generic', is_available: true, price: 12.50 },
      ],
      conversation_quality: 'complete',
      pharmacy_responsiveness: 'cooperative',
      pharmacy_asked_for_prescription: true,
      pharmacy_offered_delivery: false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.findings).toHaveLength(2);
  });
});

describe('ProductIdentificationSchema', () => {
  it('validates product identification', () => {
    const result = ProductIdentificationSchema.safeParse({
      products_mentioned: [
        { name_as_mentioned: 'Clonazepam 2mg genérico EMS', product_type: 'generic', laboratory: 'EMS', price: 12.50, is_available: true },
      ],
      confidence: 0.95,
      reasoning: 'Pharmacy offered unbranded Clonazepam from EMS',
    });
    expect(result.success).toBe(true);
  });
});
