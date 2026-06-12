import { describe, it, expect } from 'vitest';
import { CampaignReportSchema } from '../schemas.js';

describe('CampaignReportSchema', () => {
  it('validates a complete report', () => {
    const result = CampaignReportSchema.safeParse({
      campaign_id: 'test-campaign',
      reference_product: 'Rivotril 2mg',
      total_pharmacies_contacted: 10,
      total_pharmacies_responded: 8,
      summary: {
        reference_availability_rate: 0.5,
        reference_avg_price: 45.90,
        reference_price_range: { min: 39.90, max: 52.00 },
        similares_found: [
          { name: 'Clopam', laboratory: 'Cristália', availability_rate: 0.3, avg_price: 35.00, pharmacies_offering: 3 },
        ],
        generics_found: [
          { name: 'Clonazepam EMS', laboratory: 'EMS', availability_rate: 0.7, avg_price: 12.50, pharmacies_offering: 6 },
        ],
        prescription_required_rate: 0.4,
        delivery_offered_rate: 0.2,
        avg_conversation_quality: 'complete',
        avg_pharmacy_responsiveness: 'cooperative',
      },
      insights: ['Genéricos dominam o mercado', 'Rivotril tem disponibilidade média'],
      recommendations: ['Focar em preço competitivo', 'Monitorar entrega'],
      generated_at: '2026-06-12T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('validates minimal report', () => {
    const result = CampaignReportSchema.safeParse({
      campaign_id: 'test',
      reference_product: 'Test',
      total_pharmacies_contacted: 1,
      total_pharmacies_responded: 0,
      summary: {
        reference_availability_rate: 0,
        reference_avg_price: null,
        reference_price_range: { min: null, max: null },
        similares_found: [],
        generics_found: [],
        prescription_required_rate: 0,
        delivery_offered_rate: 0,
        avg_conversation_quality: 'poor',
        avg_pharmacy_responsiveness: 'uncooperative',
      },
      insights: [],
      recommendations: [],
      generated_at: '2026-06-12T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});
