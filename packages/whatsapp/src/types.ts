import { z } from 'zod';

export const WaWebhookMessageSchema = z.object({
  session: z.string(),
  from: z.string(),
  message: z.string().optional().default(''),
  media: z.object({
    image: z.string().nullable().optional(),
    video: z.string().nullable().optional(),
    document: z.string().nullable().optional(),
    audio: z.string().nullable().optional(),
  }).optional(),
});

export type WaWebhookMessage = z.infer<typeof WaWebhookMessageSchema>;

export const WaWebhookSessionSchema = z.object({
  session: z.string(),
  status: z.enum(['connecting', 'connected', 'disconnected']),
  user: z.object({
    name: z.string().optional(),
    id: z.string().optional(),
  }).optional(),
});

export type WaWebhookSession = z.infer<typeof WaWebhookSessionSchema>;

export interface WaSessionInfo {
  session: string;
  status: 'connecting' | 'connected' | 'disconnected';
  user?: {
    name?: string;
    id?: string;
    phone?: string;
  };
}

export interface WaSendTextOptions {
  session: string;
  to: string;
  text: string;
  isGroup?: boolean;
}

export interface WaSendImageOptions {
  session: string;
  to: string;
  imageUrl: string;
  caption?: string;
  isGroup?: boolean;
}
