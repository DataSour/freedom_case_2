import type { ImportSummary, RunSummary, TicketDetailsResponse, TicketListItem, Manager, AssistantChatRequest, AssistantChatResponse, AnalyticsQueryRequest, AnalyticsQueryResponse, BusinessUnit } from './types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8080';
const ADMIN_KEY = (import.meta as any).env?.VITE_ADMIN_KEY || '';

class APIError extends Error {
  code: string;
  details?: any;
  status: number;
  constructor(message: string, code: string, status: number, details?: any) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}, admin = false): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (admin && ADMIN_KEY) {
    headers['X-Admin-Key'] = ADMIN_KEY;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let errPayload: any = null;
    try {
      errPayload = await res.json();
    } catch {
      // ignore
    }
    const code = errPayload?.error?.code || 'API_ERROR';
    const message = errPayload?.error?.message || `Request failed with status ${res.status}`;
    const details = errPayload?.error?.details;
    throw new APIError(message, code, res.status, details);
  }
  return res.json();
}

export const api = {
  async importCSV(files: { tickets: File; managers: File; business_units: File }): Promise<ImportSummary> {
    const form = new FormData();
    form.append('tickets', files.tickets);
    form.append('managers', files.managers);
    form.append('business_units', files.business_units);
    return request<ImportSummary>('/api/import', { method: 'POST', body: form }, true);
  },

  async processTickets(): Promise<RunSummary> {
    return request<RunSummary>('/api/process', { method: 'POST' }, true);
  },

  async listTickets(params: Record<string, string>): Promise<{ items: TicketListItem[]; limit: number; offset: number }> {
    const qs = new URLSearchParams(params).toString();
    const suffix = qs ? `?${qs}` : '';
    return request(`/api/tickets${suffix}`);
  },

  async getTicket(id: string): Promise<TicketDetailsResponse> {
    return request(`/api/tickets/${id}`);
  },

  async listManagers(params: Record<string, string> = {}): Promise<{ items: Manager[] }> {
    const qs = new URLSearchParams(params).toString();
    const suffix = qs ? `?${qs}` : '';
    return request(`/api/managers${suffix}`);
  },

  async listBusinessUnits(params: Record<string, string> = {}): Promise<{ items: BusinessUnit[] }> {
    const qs = new URLSearchParams(params).toString();
    const suffix = qs ? `?${qs}` : '';
    return request(`/api/business-units${suffix}`);
  },

  async latestRun(): Promise<any> {
    return request('/api/runs/latest');
  },

  async reassignTicket(id: string, payload: { manager_id: string; reason: string }): Promise<{ status: string; override: boolean }> {
    return request(`/api/tickets/${id}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, true);
  },

  async assistantChat(payload: AssistantChatRequest): Promise<AssistantChatResponse> {
    return request(`/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, true);
  },

  async analyticsQuery(payload: AnalyticsQueryRequest): Promise<AnalyticsQueryResponse> {
    return request(`/api/analytics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, true);
  },
};

export { APIError };
