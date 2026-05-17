// Types shared across the Edge Function.

export interface OutboxRow {
  id: string;
  event_type: string;
  source_table: string;
  source_id: string;
  recipient_email: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  resend_message_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: OutboxRow;
  schema: string;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}
