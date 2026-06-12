/**
 * Brazilian state ICMS rates for pharmaceuticals (medicamentos).
 * Based on CONFAZ agreements and state legislation.
 * Keys are the PMC ICMS column identifiers from the Anvisa CMED list.
 *
 * PMC columns available in the Anvisa list:
 * 0%, 12%, 17%, 17.5%, 18%, 19%, 19.5%, 20%, 20.5%, 21%, 22%, 22.5%, 23%
 */

/** Maps each Brazilian state (UF) to its ICMS rate key for the Anvisa PMC lookup */
export const STATE_ICMS_RATE: Record<string, string> = {
  AC: '17',    // Acre
  AL: '19',    // Alagoas
  AM: '20',    // Amazonas
  AP: '18',    // Amapá
  BA: '20.5',  // Bahia
  CE: '20',    // Ceará
  DF: '20',    // Distrito Federal
  ES: '17',    // Espírito Santo
  GO: '19',    // Goiás
  MA: '22',    // Maranhão
  MG: '18',    // Minas Gerais
  MS: '17',    // Mato Grosso do Sul
  MT: '17',    // Mato Grosso
  PA: '19',    // Pará
  PB: '20',    // Paraíba
  PE: '20.5',  // Pernambuco
  PI: '21',    // Piauí
  PR: '19.5',  // Paraná
  RJ: '22',    // Rio de Janeiro
  RN: '18',    // Rio Grande do Norte
  RO: '19.5',  // Rondônia
  RR: '20',    // Roraima
  RS: '17',    // Rio Grande do Sul
  SC: '17',    // Santa Catarina
  SE: '19',    // Sergipe
  SP: '18',    // São Paulo
  TO: '20',    // Tocantins
} as const;

/** All 27 Brazilian states */
export const BRAZILIAN_STATES = Object.keys(STATE_ICMS_RATE) as string[];

/** All ICMS rate tiers available in the Anvisa PMC list */
export const ICMS_RATES = ['0', '12', '17', '17.5', '18', '19', '19.5', '20', '20.5', '21', '22', '22.5', '23'] as const;

/** Group states by ICMS rate for campaign grouping */
export function getStatesByIcms(): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const [state, rate] of Object.entries(STATE_ICMS_RATE)) {
    if (!groups[rate]) groups[rate] = [];
    groups[rate].push(state);
  }
  // Sort states within each group
  for (const states of Object.values(groups)) {
    states.sort();
  }
  return groups;
}

/**
 * Look up the PMC (Preço Máximo ao Consumidor) for a product in a given state.
 * @param pmcByIcms - The PMC map from anvisa_products (keys are ICMS rate strings, values are price strings)
 * @param state - Brazilian state abbreviation (e.g. 'SP', 'RJ')
 * @returns The PMC value in BRL, or null if not found
 */
export function getPmcForState(
  pmcByIcms: Record<string, string | number>,
  state: string,
): number | null {
  const rate = STATE_ICMS_RATE[state.toUpperCase()];
  if (!rate) return null;
  const value = pmcByIcms[rate];
  if (value == null) return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  return isNaN(num) ? null : num;
}
