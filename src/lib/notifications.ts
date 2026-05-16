/**
 * Notification stub for B2B cabinet events.
 *
 * MVP: just console.log. Hook for future Resend integration —
 * all call sites already pass through here, no refactoring needed
 * to swap in real email sending.
 */

export type NotifyEvent =
  | { type: 'application_submitted'; applicationId: string; applicantEmail: string }
  | { type: 'application_approved'; applicationId: string; applicantEmail: string }
  | { type: 'application_rejected'; applicationId: string; applicantEmail: string; reason: string }
  | { type: 'booking_created'; bookingId: string; clubSlug: string; ownerEmails: string[] }
  | { type: 'booking_confirmed'; bookingId: string; customerEmail: string }
  | { type: 'booking_cancelled'; bookingId: string; recipientEmails: string[] }
  | { type: 'booking_completed'; bookingId: string; customerEmail: string }
  | { type: 'booking_no_show'; bookingId: string; customerEmail: string };

export async function notify(event: NotifyEvent): Promise<void> {
  // MVP: log to console for debugging.
  console.info('[notify]', event.type, event);

  // Future:
  // if (import.meta.env.RESEND_API_KEY) {
  //   await sendViaResend(event);
  // }
}
