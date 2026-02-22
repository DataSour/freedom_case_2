export type AssignmentStatus = 'ASSIGNED' | 'UNASSIGNED' | 'ERROR';

export interface TicketListItem {
  id: string;
  created_at: string;
  segment: string;
  city: string;
  address: string;
  message: string;
  status?: AssignmentStatus | null;
  office?: string | null;
  manager_id?: string | null;
  language?: string | null;
  priority?: number | null;
  type?: string | null;
  sentiment?: string | null;
  reason_code?: string | null;
  reason_text?: string | null;
}

export interface Manager {
  id: string;
  name: string;
  office: string;
  role: string;
  skills: string[];
  current_load: number;
  baseline_load?: number | null;
  updated_at: string;
}

export interface TicketDetailsResponse {
  ticket: {
    id: string;
    created_at: string;
    segment: string;
    city: string;
    address: string;
    message: string;
    raw_json?: string;
  };
  assignment?: {
    id: string;
    manager_id?: string | null;
    office?: string | null;
    status?: AssignmentStatus | null;
    reason_code?: string | null;
    reason_text?: string | null;
    reasoning?: any;
    assigned_at?: string;
  };
  ai_analysis?: {
    id: string;
    type?: string;
    sentiment?: string;
    priority?: number;
    language?: string;
    summary?: string;
    recommendation?: string;
    lat?: number;
    lon?: number;
    confidence?: number;
    model_version?: string;
    created_at?: string;
  };
}

export interface ImportSummary {
  tickets: { parsed: number; inserted: number; errors: number };
  managers: { parsed: number; inserted: number; errors: number };
  business_units: { parsed: number; inserted: number; errors: number };
  errors?: string[];
}

export interface RunSummary {
  events: Array<Record<string, any>>;
  counts: Record<string, any>;
}

export interface BusinessUnit {
  id: string;
  name: string;
  city?: string;
  address?: string;
  lat?: number | null;
  lon?: number | null;
  geocode_display_name?: string | null;
  geocoded_at?: string | null;
}

export interface AssistantChatRequest {
  message: string;
  history?: Array<{ role: string; content: string }>;
}

export interface AssistantChatResponse {
  answer: string;
}

export interface AnalyticsQueryRequest {
  group_by: string[];
  filters?: Record<string, string>;
  limit?: number;
}

export interface AnalyticsQueryResponse {
  items: Array<Record<string, any>>;
}
