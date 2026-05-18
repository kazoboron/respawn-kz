// =====================================================================
// Booking
// =====================================================================

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Booking {
  id: string;
  user_id: string;
  club_slug: string;
  club_name: string;
  city_id: string;
  date: string;
  time_slot: string;
  hours: number;
  price_per_hour: number;
  total_price: number;
  status: BookingStatus;
  status_changed_at: string;
  status_changed_by: string | null;
  created_at: string;
}

export type NewBooking = Omit<Booking, 'id' | 'status' | 'status_changed_at' | 'status_changed_by' | 'created_at'>;

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  cancelled: 'Отменена',
  no_show: 'Не пришёл',
};

export const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: 'pill--pending',
  confirmed: 'pill--confirmed',
  completed: 'pill--completed',
  cancelled: 'pill--cancelled',
  no_show: 'pill--no-show',
};

// Terminal statuses cannot be transitioned away from (enforced by DB trigger)
export const TERMINAL_STATUSES: BookingStatus[] = ['cancelled', 'completed', 'no_show'];

export function isTerminalStatus(s: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

// =====================================================================
// Club application
// =====================================================================

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface ClubApplication {
  id: string;
  applicant_user_id: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  club_name: string;
  city: string;
  district: string | null;
  address: string;
  working_hours: string | null;
  equipment_note: string | null;
  photo_url: string | null;
  description: string | null;
  status: ApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export type NewClubApplication = Omit<
  ClubApplication,
  'id' | 'status' | 'reviewed_by' | 'reviewed_at' | 'review_note' | 'created_at'
>;

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Ожидает рассмотрения',
  approved: 'Одобрена',
  rejected: 'Отклонена',
};

// =====================================================================
// Club admin / Super admin
// =====================================================================

export interface ClubAdmin {
  id: string;
  user_id: string;
  club_slug: string;
  created_at: string;
  granted_by: string | null;
}

export interface SuperAdmin {
  user_id: string;
  added_at: string;
  added_by: string | null;
}

// =====================================================================
// Club (re-export from clubs-loader for client scripts)
// =====================================================================

export type { ClubRow } from '../lib/clubs-loader';

// =====================================================================
// Review
// =====================================================================

export type ReviewStatus = 'published' | 'hidden';

export interface Review {
  id: string;
  booking_id: string;
  user_id: string;
  club_slug: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  hidden_by: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type NewReview = Omit<
  Review,
  'id' | 'status' | 'hidden_by' | 'hidden_at' | 'hidden_reason' | 'created_at' | 'updated_at'
>;

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  published: 'Опубликован',
  hidden: 'Скрыт',
};
