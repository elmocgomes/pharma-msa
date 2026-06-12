export interface ParsedApresentacao {
  dosagem: string | null;
  forma: string | null;
  quantidade: string | null;
}

const FORM_KEYWORDS = [
  'COM REV', 'COM SUB', 'COM MAST', 'COM EFE', 'COM DISP', 'COM',
  'CAP DURA', 'CAP MOLE', 'CAP GEL DURA', 'CAP',
  'DRG', 'DRAG',
  'SOL INJ', 'SOL OR', 'SOL TOP', 'SOL OFT', 'SOL NAS', 'SOL DIL INFUS IV', 'SOL DIL INFUS', 'SOL',
  'SUS INJ', 'SUS OR', 'SUS',
  'PO SOL INJ', 'PO SOL OR', 'PO SUS OR', 'PO SUS INJ', 'PO LIOF SOL INJ', 'PO LIOF SUS INJ', 'PO LIOF', 'PO SOL', 'PO SUS', 'PO',
  'CREM DERM', 'CREM VAG', 'CREM',
  'POM OFT', 'POM DERM', 'POM',
  'GEL DERM', 'GEL OR', 'GEL',
  'EMUL DERM', 'EMUL OR', 'EMUL INJ', 'EMUL',
  'LOC DERM', 'LOC',
  'SHAM', 'XPE', 'INAL', 'AERO', 'SPR NAS', 'SPR',
  'GRAN', 'SUP', 'PAST', 'SIS TRANSD', 'IMPL',
  'AMP',
];

const DOSAGE_RE = /^(\(?[\d,.]+(?:\s*\+\s*[\d,.]+)*\)?)\s*(MG\/ML|MG\/G|MCG\/DOSE|MCG\/ML|MCG|MG|G\/ML|G|UI\/ML|UI|%|ML)/i;
const QUANTITY_RE = /X\s+([\d,.]+(?:\s*ML|\s*G|\s*L|\s*MCG)?)/i;

export function parseApresentacao(raw: string): ParsedApresentacao {
  const text = raw.replace(/\s+/g, ' ').trim();

  // Extract dosage from start
  const dosMatch = text.match(DOSAGE_RE);
  const dosagem = dosMatch ? `${dosMatch[1]!.trim()} ${dosMatch[2]!.toUpperCase()}` : null;

  // Find pharmaceutical form
  let forma: string | null = null;
  const afterDosage = dosMatch ? text.slice(dosMatch[0].length).trim() : text;
  for (const kw of FORM_KEYWORDS) {
    const idx = afterDosage.indexOf(kw);
    if (idx !== -1) {
      forma = kw;
      break;
    }
  }

  // Extract quantity (after "X")
  const qtyMatch = text.match(QUANTITY_RE);
  const quantidade = qtyMatch ? qtyMatch[1]!.trim() : null;

  return { dosagem, forma, quantidade };
}
