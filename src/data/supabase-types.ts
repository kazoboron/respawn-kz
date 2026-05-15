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
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

export type NewBooking = Omit<Booking, 'id' | 'user_id' | 'status' | 'created_at'>;

export const STATUS_LABELS: Record<Booking['status'], string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  cancelled: 'Отменена',
};
