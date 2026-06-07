import type { WaSessionInfo, WaSendTextOptions, WaSendImageOptions } from './types.js';

export class WhatsAppClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'KEY': this.apiKey,
      ...options.headers as Record<string, string>,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`wa-gateway ${options.method ?? 'GET'} ${path} failed (${response.status}): ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async listSessions(): Promise<WaSessionInfo[]> {
    const result = await this.request<{ data: WaSessionInfo[] }>('/session');
    return result.data;
  }

  async getSession(session: string): Promise<WaSessionInfo> {
    const result = await this.request<{ data: WaSessionInfo }>(`/session/${session}`);
    return result.data;
  }

  async startSession(session: string): Promise<{ qr?: string; message?: string }> {
    const result = await this.request<{ data: { qr?: string; message?: string } }>(
      '/session/start',
      { method: 'POST', body: JSON.stringify({ session }) },
    );
    return result.data;
  }

  async deleteSession(session: string): Promise<void> {
    await this.request(`/session/${session}`, { method: 'DELETE' });
  }

  async sendText(opts: WaSendTextOptions): Promise<void> {
    await this.request('/message/send-text', {
      method: 'POST',
      body: JSON.stringify({
        session: opts.session,
        to: opts.to,
        text: opts.text,
        is_group: opts.isGroup ?? false,
      }),
    });
  }

  async sendImage(opts: WaSendImageOptions): Promise<void> {
    await this.request('/message/send-image', {
      method: 'POST',
      body: JSON.stringify({
        session: opts.session,
        to: opts.to,
        image: opts.imageUrl,
        caption: opts.caption,
        is_group: opts.isGroup ?? false,
      }),
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request('/health');
      return true;
    } catch {
      return false;
    }
  }
}
