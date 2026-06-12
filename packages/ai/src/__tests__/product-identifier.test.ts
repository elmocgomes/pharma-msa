import { describe, it, expect } from 'vitest';
import { ProductIdentificationSchema } from '@pharma/shared';

describe('ProductIdentificationSchema', () => {
  it('validates identification of a generic', () => {
    const result = ProductIdentificationSchema.safeParse({
      products_mentioned: [
        {
          name_as_mentioned: 'Clonazepam 2mg genérico EMS',
          product_type: 'generic',
          laboratory: 'EMS',
          presentation: { dosage: '2mg', form: 'comprimido' },
          price: 12.50,
          is_available: true,
        },
      ],
      confidence: 0.95,
      reasoning: 'Pharmacy offered unbranded Clonazepam (generic) from EMS laboratory',
    });
    expect(result.success).toBe(true);
    expect(result.data!.products_mentioned).toHaveLength(1);
    expect(result.data!.products_mentioned[0].product_type).toBe('generic');
  });

  it('validates multiple products in one response', () => {
    const result = ProductIdentificationSchema.safeParse({
      products_mentioned: [
        { name_as_mentioned: 'Rivotril', product_type: 'reference', laboratory: null, is_available: false },
        { name_as_mentioned: 'Clopam', product_type: 'similar', laboratory: null, is_available: true },
        { name_as_mentioned: 'genérico', product_type: 'generic', laboratory: null, is_available: true },
      ],
      confidence: 0.85,
      reasoning: 'Pharmacy confirmed reference unavailable but offered similar and generic',
    });
    expect(result.success).toBe(true);
    expect(result.data!.products_mentioned).toHaveLength(3);
  });

  it('validates empty products array', () => {
    const result = ProductIdentificationSchema.safeParse({
      products_mentioned: [],
      confidence: 0.3,
      reasoning: 'No specific products mentioned',
    });
    expect(result.success).toBe(true);
  });
});
