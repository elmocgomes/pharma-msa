import type { FlowTree } from '../schemas.js';

export const STANDARD_INQUIRY_TEMPLATE: FlowTree = {
  greeting: {
    type: 'send',
    id: 'greeting',
    message: 'Olá, boa tarde! Gostaria de saber se vocês têm {product_name} disponível?',
    variants: [
      'Oi, boa tarde! Vocês têm {product_name} aí?',
      'Boa tarde! Estou precisando de {product_name}, vocês têm?',
      'Oi! Tem {product_name} disponível aí na farmácia?',
    ],
    delay_ms: 2500,
    next: 'wait_availability',
  },

  wait_availability: {
    type: 'classify',
    id: 'wait_availability',
    intent: 'Check if the pharmacy has the product available in stock',
    rulePhase: 'availability',
    branches: [
      { category: 'available', description: 'Product is available or in stock', next: 'ask_price' },
      { category: 'unavailable', description: 'Product is not available, out of stock, or sold out', next: 'ask_alternative' },
      { category: 'need_info', description: 'Pharmacy asks for more details like dosage, brand, or form', next: 'provide_details' },
    ],
    timeout_ms: 300_000,
    timeout_next: 'timeout_followup',
    max_retries: 2,
  },

  ask_price: {
    type: 'send',
    id: 'ask_price',
    message: 'Ótimo! Qual o valor?',
    variants: [
      'Que bom! Quanto está saindo?',
      'Legal! Qual o preço?',
    ],
    delay_ms: 1500,
    next: 'wait_price',
  },

  wait_price: {
    type: 'classify',
    id: 'wait_price',
    intent: 'Get the price of the product',
    rulePhase: 'price',
    branches: [
      { category: 'price_given', description: 'Pharmacy provides a price (R$ value, number of reais)', next: 'ask_generic' },
      { category: 'no_price', description: 'Pharmacy cannot or will not give price via WhatsApp', next: 'ask_generic' },
    ],
    timeout_ms: 300_000,
    timeout_next: 'ask_generic',
    max_retries: 1,
  },

  ask_generic: {
    type: 'send',
    id: 'ask_generic',
    message: 'E vocês têm o genérico também? Qual seria o valor?',
    variants: [
      'Tem o genérico também? Quanto sai?',
      'E o genérico, vocês têm? Qual o preço?',
    ],
    delay_ms: 2000,
    next: 'wait_generic',
  },

  wait_generic: {
    type: 'classify',
    id: 'wait_generic',
    intent: 'Check if generic version is available and its price',
    rulePhase: 'generic',
    branches: [
      { category: 'has_generic', description: 'Generic is available, possibly with price', next: 'next_product' },
      { category: 'no_generic', description: 'No generic available', next: 'next_product' },
    ],
    timeout_ms: 300_000,
    timeout_next: 'next_product',
    max_retries: 1,
  },

  ask_alternative: {
    type: 'send',
    id: 'ask_alternative',
    message: 'Ah, que pena. Vocês teriam algum similar ou genérico com {active_ingredient}?',
    variants: [
      'Poxa. E algum similar ou genérico com {active_ingredient}, vocês têm?',
      'Entendi. Tem alguma alternativa com {active_ingredient}?',
    ],
    delay_ms: 2000,
    next: 'wait_alternative',
  },

  wait_alternative: {
    type: 'classify',
    id: 'wait_alternative',
    intent: 'Check if alternatives or generics with the same active ingredient are available',
    rulePhase: 'alternative',
    branches: [
      { category: 'has_alternatives', description: 'Alternatives, similars, or generics are available', next: 'next_product' },
      { category: 'nothing_available', description: 'Nothing similar or alternative available', next: 'next_product' },
    ],
    timeout_ms: 300_000,
    timeout_next: 'next_product',
    max_retries: 1,
  },

  provide_details: {
    type: 'send',
    id: 'provide_details',
    message: 'Claro! Seria {product_name}, {dosage}. {brand} mesmo.',
    variants: [
      'É {product_name} de {dosage}, do {brand}.',
    ],
    delay_ms: 2000,
    next: 'wait_availability',
  },

  timeout_followup: {
    type: 'send',
    id: 'timeout_followup',
    message: 'Oi, conseguiram verificar sobre o {product_name}?',
    variants: [
      'Oi! Tudo bem? Conseguiram ver sobre o {product_name}?',
    ],
    delay_ms: 1000,
    next: 'wait_availability',
  },

  next_product: {
    type: 'next_product',
    id: 'next_product',
    has_more_next: 'transition_product',
    done_next: 'closing',
  },

  transition_product: {
    type: 'send',
    id: 'transition_product',
    message: 'Aproveitar e perguntar, vocês têm {product_name} também?',
    variants: [
      'E {product_name}, vocês têm?',
      'Ah, e sobre {product_name}, tem aí?',
    ],
    delay_ms: 2500,
    next: 'wait_availability',
  },

  closing: {
    type: 'complete',
    id: 'closing',
    message: 'Muito obrigado pela atenção! Tenham um ótimo dia!',
  },
};

export const STANDARD_INQUIRY_ENTRY_NODE = 'greeting';

export const STANDARD_INQUIRY_METADATA = {
  name: 'Standard Pharmacy Inquiry',
  description: 'Inquires about product availability, price, and generic alternatives for each product in the campaign.',
  version: 1,
};
