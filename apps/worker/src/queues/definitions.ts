export const QUEUE_NAMES = {
  campaign: 'campaign',
  conversation: 'conversation',
  parse: 'parse',
  extract: 'extract',
  analyze: 'analyze',
  maintenance: 'maintenance',
} as const;

export interface CampaignJobData {
  campaignId: string;
  traceId: string;
}

export interface ConversationJobData {
  conversationId: string;
  traceId: string;
}

export interface ParseJobData {
  conversationId: string;
  messageId: string;
  traceId: string;
}

export interface ExtractJobData {
  conversationId: string;
  traceId: string;
}

export interface AnalyzeJobData {
  campaignId: string;
  traceId: string;
}

export interface MaintenanceJobData {
  task: 'check_timeouts' | 'daily_reset';
  traceId: string;
}
