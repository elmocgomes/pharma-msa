import { pgTable, uuid, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';

export const pharmacies = pgTable('pharmacies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phoneNumber: text('phone_number').notNull(),
  city: text('city'),
  state: text('state'),
  notes: text('notes'),

  // CNPJ data (from Receita Federal / Excel import)
  cnpj: text('cnpj').unique(),
  matrizFilial: text('matriz_filial'),
  razaoSocial: text('razao_social'),
  nomeFantasia: text('nome_fantasia'),
  phone2: text('phone2'),
  email: text('email'),
  cnaePrimario: text('cnae_primario'),
  cnaeDescricao: text('cnae_descricao'),

  // Address
  tipoLogradouro: text('tipo_logradouro'),
  logradouro: text('logradouro'),
  numero: text('numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cep: text('cep'),
  codigoMunicipio: integer('codigo_municipio'),

  // Company info
  porte: text('porte'),
  naturezaJuridica: text('natureza_juridica'),
  dataAtividade: text('data_atividade'),
  dataSituacao: text('data_situacao'),

  // Enrichment: chain & association
  chainName: text('chain_name'),
  associationName: text('association_name'),
  whatsappNumber: text('whatsapp_number'),
  whatsappVerified: boolean('whatsapp_verified').default(false),

  // Scraping metadata
  lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),
  scrapeSource: text('scrape_source'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_pharmacies_cnpj').on(t.cnpj),
  index('idx_pharmacies_state').on(t.state),
  index('idx_pharmacies_chain').on(t.chainName),
  index('idx_pharmacies_cep').on(t.cep),
]);
