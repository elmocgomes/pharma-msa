export { createDb, type Db } from './client.js';

export { waSessions } from './schema/wa-sessions.js';
export { pharmacies } from './schema/pharmacies.js';
export { products } from './schema/products.js';
export { scripts } from './schema/scripts.js';
export { campaigns, campaignPharmacies, campaignProducts } from './schema/campaigns.js';
export { conversations } from './schema/conversations.js';
export { messages } from './schema/messages.js';
export { extractionResults, productFindings } from './schema/extractions.js';
export { conversationEvents } from './schema/events.js';
export { agentPrompts, promptVersions } from './schema/prompts.js';

export { transitionConversation, findActiveConversation, findActiveConversationBySession } from './queries/conversations.js';
export { computeIdempotencyKey, insertMessageIdempotent, getConversationMessages, getRecentMessages } from './queries/messages.js';
export { emitEvent } from './queries/events.js';
