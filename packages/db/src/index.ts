export { createDb, type Db } from './client.js';

export { waSessions } from './schema/wa-sessions.js';
export { pharmacies } from './schema/pharmacies.js';
export { products } from './schema/products.js';
export { scripts } from './schema/scripts.js';
export { campaigns, campaignPharmacies, campaignProducts } from './schema/campaigns.js';
export { campaignGroups } from './schema/campaign-groups.js';
export { anvisaProducts, type PmcByIcms } from './schema/anvisa.js';
export { conversations } from './schema/conversations.js';
export { messages } from './schema/messages.js';
export { extractionResults, productFindings } from './schema/extractions.js';
export { conversationEvents } from './schema/events.js';
export { campaignReports } from './schema/reports.js';
export { agentPrompts, promptVersions } from './schema/prompts.js';
export { trainingEvaluations } from './schema/training.js';

export { transitionConversation, findActiveConversation, findActiveConversationBySession } from './queries/conversations.js';
export { computeIdempotencyKey, insertMessageIdempotent, getConversationMessages, getRecentMessages } from './queries/messages.js';
export { emitEvent } from './queries/events.js';
