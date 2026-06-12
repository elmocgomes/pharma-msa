import { pgTable, uuid, text, timestamp, jsonb, date, index } from 'drizzle-orm/pg-core';

/** PMC by ICMS rate map: keys are ICMS % strings ("0","12","17",...), values are price strings */
export type PmcByIcms = Record<string, string>;

export const anvisaProducts = pgTable('anvisa_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  substancia: text('substancia').notNull(),
  produto: text('produto').notNull(),
  apresentacao: text('apresentacao').notNull(),
  laboratorio: text('laboratorio'),
  tipoProduto: text('tipo_produto').notNull(), // Novo, Similar, Genérico, Biológico, etc.
  ean: text('ean'),
  codigoGgrem: text('codigo_ggrem'),
  registro: text('registro'),
  classeTerapeutica: text('classe_terapeutica'),
  tarja: text('tarja'),
  regimePreco: text('regime_preco'), // Regulado / Liberado
  pmcByIcms: jsonb('pmc_by_icms').notNull().$type<PmcByIcms>(),
  pfByIcms: jsonb('pf_by_icms').$type<PmcByIcms>(), // factory prices (optional)
  restricaoHospitalar: text('restricao_hospitalar'),
  cap: text('cap'),
  confaz87: text('confaz_87'),
  icms0: text('icms_0'),
  comercializacao: text('comercializacao'),
  destinacaoComercial: text('destinacao_comercial'),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  dataPublicacao: date('data_publicacao'),
}, (t) => [
  index('idx_anvisa_substancia').on(t.substancia),
  index('idx_anvisa_produto').on(t.produto),
  index('idx_anvisa_ean').on(t.ean),
  index('idx_anvisa_codigo_ggrem').on(t.codigoGgrem),
]);
