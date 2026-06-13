import { parseApresentacao } from './apresentacao-parser.js';

const FORM_DISPLAY: Record<string, string> = {
  'COM': 'comprimidos',
  'COM REV': 'comprimidos revestidos',
  'COM SUB': 'comprimidos sublinguais',
  'COM MAST': 'comprimidos mastigáveis',
  'COM EFE': 'comprimidos efervescentes',
  'COM DISP': 'comprimidos dispersíveis',
  'CAP': 'cápsulas',
  'CAP DURA': 'cápsulas',
  'CAP MOLE': 'cápsulas moles',
  'CAP GEL DURA': 'cápsulas',
  'DRG': 'drágeas',
  'DRAG': 'drágeas',
  'SOL OR': 'solução oral',
  'SOL INJ': 'solução injetável',
  'SOL TOP': 'solução tópica',
  'SOL OFT': 'solução oftálmica',
  'SOL NAS': 'solução nasal',
  'SUS OR': 'suspensão oral',
  'SUS INJ': 'suspensão injetável',
  'PO SUS OR': 'pó para suspensão oral',
  'PO SOL OR': 'pó para solução oral',
  'PO LIOF': 'pó liofilizado',
  'CREM DERM': 'creme dermatológico',
  'CREM VAG': 'creme vaginal',
  'CREM': 'creme',
  'POM OFT': 'pomada oftálmica',
  'POM DERM': 'pomada',
  'POM': 'pomada',
  'GEL': 'gel',
  'XPE': 'xarope',
  'SPR NAS': 'spray nasal',
  'SPR': 'spray',
  'SUP': 'supositórios',
  'PAST': 'pastilhas',
  'GRAN': 'granulado',
  'AERO': 'aerosol',
  'INAL': 'inalante',
  'LOC': 'loção',
  'EMUL': 'emulsão',
  'AMP': 'ampolas',
  'SOL': 'solução',
  'SUS': 'suspensão',
  'PO': 'pó',
};

const UNIT_FORMS = new Set([
  'COM', 'COM REV', 'COM SUB', 'COM MAST', 'COM EFE', 'COM DISP',
  'CAP', 'CAP DURA', 'CAP MOLE', 'CAP GEL DURA',
  'DRG', 'DRAG', 'SUP', 'PAST', 'AMP',
]);

function normalizeDosage(dosagem: string): string {
  return dosagem
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function titleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function formatProductForInquiry(product: {
  name: string;
  dosage?: string | null;
  activeIngredient?: string | null;
}): string {
  const name = titleCase(product.name);

  if (!product.dosage) return name;

  const parsed = parseApresentacao(product.dosage);

  const parts: string[] = [name];

  if (parsed.dosagem) {
    parts.push(normalizeDosage(parsed.dosagem));
  }

  if (parsed.quantidade && parsed.forma) {
    const formDisplay = FORM_DISPLAY[parsed.forma];
    const isUnitForm = UNIT_FORMS.has(parsed.forma);
    const qty = parsed.quantidade.replace(/\s+/g, '').toLowerCase();

    if (isUnitForm && formDisplay) {
      parts.push(`com ${qty} ${formDisplay}`);
    } else if (formDisplay) {
      parts.push(`${formDisplay} ${qty}`);
    }
  } else if (parsed.forma) {
    const formDisplay = FORM_DISPLAY[parsed.forma];
    if (formDisplay) parts.push(formDisplay);
  }

  return parts.join(' ');
}
