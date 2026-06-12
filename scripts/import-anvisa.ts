/**
 * Import Anvisa CMED product list from XLSX into the pharma-msa database.
 *
 * Usage:
 *   npx tsx scripts/import-anvisa.ts <path-to-xlsx> [api-url]
 *
 * Example:
 *   npx tsx scripts/import-anvisa.ts ~/Downloads/xls_conformidade_site_20260610_121627707.xlsx http://localhost:3000
 *   npx tsx scripts/import-anvisa.ts ~/Downloads/xls_conformidade_site_20260610_121627707.xlsx http://iherfq1tsfneqh0we5iypci1.157.180.67.154.sslip.io
 */

import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const HEADER_ROW = 42; // 0-indexed row where column headers are
const DATA_START = 43; // 0-indexed row where data starts

// PMC column indices (from Anvisa XLSX structure)
const PMC_COLS: Record<string, number> = {
  '0': 40,     // PMC 0 %
  '12': 41,    // PMC 12 %
  '17': 43,    // PMC 17 %
  '17.5': 45,  // PMC 17,5 %
  '18': 47,    // PMC 18 %
  '19': 49,    // PMC 19 %
  '19.5': 51,  // PMC 19,5 %
  '20': 53,    // PMC 20 %
  '20.5': 55,  // PMC 20,5 %
  '21': 57,    // PMC 21 %
  '22': 59,    // PMC 22 %
  '22.5': 61,  // PMC 22,5 %
  '23': 63,    // PMC 23 %
};

// PF (Preço Fábrica) column indices
const PF_COLS: Record<string, number> = {
  '0': 14,     // PF 0%
  '12': 15,    // PF 12 %
  '17': 17,    // PF 17 %
  '17.5': 19,  // PF 17,5 %
  '18': 21,    // PF 18 %
  '19': 23,    // PF 19 %
  '19.5': 25,  // PF 19,5 %
  '20': 27,    // PF 20 %
  '20.5': 29,  // PF 20,5 %
  '21': 31,    // PF 21 %
  '22': 33,    // PF 22 %
  '22.5': 35,  // PF 22,5 %
  '23': 37,    // PF 23 %
};

// Column indices for main fields
const COL = {
  SUBSTANCIA: 0,
  CNPJ: 1,
  LABORATORIO: 2,
  CODIGO_GGREM: 3,
  REGISTRO: 4,
  EAN1: 5,
  EAN2: 6,
  EAN3: 7,
  PRODUTO: 8,
  APRESENTACAO: 9,
  CLASSE_TERAPEUTICA: 10,
  TIPO_PRODUTO: 11,
  REGIME_PRECO: 12,
  PF_SEM_IMPOSTOS: 13,
  PMC_SEM_IMPOSTOS: 39,
  RESTRICAO_HOSPITALAR: 65,
  CAP: 66,
  CONFAZ_87: 67,
  ICMS_0: 68,
  COMERCIALIZACAO: 71,
  TARJA: 72,
  DESTINACAO_COMERCIAL: 73,
};

function cleanValue(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '    -     ') return null;
  return s;
}

function formatPrice(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return v.toFixed(2);
  const s = String(v).trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n.toFixed(2);
}

function mapTipoProduto(raw: string | null): string {
  if (!raw) return 'Outro';
  const t = raw.trim();
  // Map Anvisa types to our classification
  if (t === 'Genérico') return 'Genérico';
  if (t === 'Similar') return 'Similar';
  if (t === 'Novo') return 'Novo';
  if (t === 'Biológico') return 'Biológico';
  if (t === 'Específico') return 'Específico';
  if (t === 'Fitoterápico') return 'Fitoterápico';
  if (t === 'Radiofármaco') return 'Radiofármaco';
  if (t === 'Produto de Terapia Avançada') return 'Terapia Avançada';
  return t;
}

async function main() {
  const [, , xlsxPath, apiUrl = 'http://localhost:3000'] = process.argv;

  if (!xlsxPath) {
    console.error('Usage: npx tsx scripts/import-anvisa.ts <path-to-xlsx> [api-url]');
    process.exit(1);
  }

  console.log(`Reading ${xlsxPath}...`);
  const buf = readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  console.log(`Total rows: ${allRows.length}, data starts at row ${DATA_START}`);

  // Verify header row
  const headers = allRows[HEADER_ROW] as string[];
  if (!headers?.[0]?.includes('SUBSTÂNCIA')) {
    console.error(`Header row mismatch. Expected SUBSTÂNCIA at row ${HEADER_ROW}, got: ${headers?.[0]}`);
    process.exit(1);
  }
  console.log(`Header verified: ${headers[0]}`);

  // Parse all data rows
  const products: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (let i = DATA_START; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    if (!row || !row[COL.SUBSTANCIA] || !row[COL.PRODUTO]) {
      skipped++;
      continue;
    }

    // Build PMC map
    const pmcByIcms: Record<string, string> = {};
    for (const [rate, col] of Object.entries(PMC_COLS)) {
      const price = formatPrice(row[col]);
      if (price) pmcByIcms[rate] = price;
    }

    // Build PF map
    const pfByIcms: Record<string, string> = {};
    for (const [rate, col] of Object.entries(PF_COLS)) {
      const price = formatPrice(row[col]);
      if (price) pfByIcms[rate] = price;
    }

    const ean = cleanValue(row[COL.EAN1]);

    products.push({
      substancia: String(row[COL.SUBSTANCIA]).trim(),
      produto: String(row[COL.PRODUTO]).trim(),
      apresentacao: String(row[COL.APRESENTACAO] ?? '').trim(),
      laboratorio: cleanValue(row[COL.LABORATORIO]),
      tipoProduto: mapTipoProduto(cleanValue(row[COL.TIPO_PRODUTO])),
      ean,
      codigoGgrem: cleanValue(row[COL.CODIGO_GGREM]),
      registro: cleanValue(row[COL.REGISTRO]),
      classeTerapeutica: cleanValue(row[COL.CLASSE_TERAPEUTICA]),
      tarja: cleanValue(row[COL.TARJA]),
      regimePreco: cleanValue(row[COL.REGIME_PRECO]),
      pmcByIcms,
      pfByIcms: Object.keys(pfByIcms).length > 0 ? pfByIcms : undefined,
      restricaoHospitalar: cleanValue(row[COL.RESTRICAO_HOSPITALAR]),
      cap: cleanValue(row[COL.CAP]),
      confaz87: cleanValue(row[COL.CONFAZ_87]),
      icms0: cleanValue(row[COL.ICMS_0]),
      comercializacao: cleanValue(row[COL.COMERCIALIZACAO]),
      destinacaoComercial: cleanValue(row[COL.DESTINACAO_COMERCIAL]),
    });
  }

  console.log(`Parsed ${products.length} products (${skipped} empty rows skipped)`);

  // Send to API in batches
  const BATCH_SIZE = 2000;
  let totalImported = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const isFirst = i === 0;

    console.log(`Sending batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(products.length / BATCH_SIZE)} (${batch.length} products)...`);

    const res = await fetch(`${apiUrl}/anvisa/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: batch,
        dataPublicacao: '2026-06-10',
        clearExisting: isFirst, // Only clear on first batch
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Failed: ${res.status} ${text}`);
      process.exit(1);
    }

    const result = await res.json() as { imported: number };
    totalImported += result.imported;
    console.log(`  Imported: ${result.imported} (total: ${totalImported})`);
  }

  console.log(`\nDone! Total imported: ${totalImported}`);
}

main().catch(console.error);
