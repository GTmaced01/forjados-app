export type UserRole = 'member' | 'leader' | 'director' | 'treasury' | 'admin';

export type InscriptionStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  full_name?: string;
  phone?: string;
  birth_date?: string | null;
  city?: string;
  neighborhood?: string;
  member_since?: string | null;

  role: UserRole;
  requested_role: UserRole;
  inscription_status: InscriptionStatus;
  is_admin: boolean;
  member_id?: string;

  sectors: string[];
  primary_team?: string | null;
  specific_function?: string;
  experience_level?: string;
  shirt_size?: string;

  food_restrictions?: string;
  health_problems?: string;
  continuous_medicine?: string;
  emergency_contact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };

  has_vehicle: boolean;
  skills: string[];
  terms_accepted?: {
    imageUse?: boolean;
    commitment?: boolean;
    rules?: boolean;
    termsOfParticipation?: boolean;
    truthfulInfo?: boolean;
    privacyPolicy?: boolean;
    responsibilityTerm?: boolean;
  };

  points: number;
  created_at: string;
  updated_at: string;
}

export type PaymentReceiptStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentReceipt {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_whatsapp?: string;
  amount: number;
  file_url: string;
  file_name: string;
  file_type: string;
  status: PaymentReceiptStatus;
  type: 'inscription' | 'order';
  observations?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export type ShirtOrderStatus =
  | 'cart'
  | 'waiting_payment'
  | 'receipt_sent'
  | 'payment_approved'
  | 'payment_rejected'
  | 'delivered'
  | 'cancelled';

export interface Shirt {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  stock: Record<string, number>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShirtOrder {
  id: string;
  user_id: string;
  total_price: number;
  status: ShirtOrderStatus;
  proof_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ShirtOrderItem {
  id: string;
  order_id: string;
  shirt_id: string | null;
  name: string;
  size: string;
  quantity: number;
  price: number;
  created_at: string;
}

export interface CartItem {
  shirt: Shirt;
  size: string;
  quantity: number;
}

export type RideStatus =
  | 'available'
  | 'full'
  | 'cancelled'
  | 'confirmed'
  | 'completed'
  | 'not_completed';

export interface Ride {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_photo_url?: string;
  departure_location: string;
  departure_time?: string;
  total_seats: number;
  available_seats: number;
  vehicle_type?: string;
  status: RideStatus;
  notes?: string;
  confirmed_passenger_count?: number;
  completed_points_awarded: boolean;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
  passengers?: RidePassenger[];
}

export interface RidePassenger {
  id: string;
  ride_id: string;
  passenger_id: string;
  passenger_name: string;
  status: string;
  created_at: string;
}

export interface PointTransaction {
  id: string;
  user_id: string;
  member_id?: string;
  amount: number;
  reason: string;
  granted_by?: string | null;
  granted_by_name?: string;
  source_type?: string;
  source_id?: string | null;
  created_at: string;
}

export interface PointsStoreProduct {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  points_cost: number;
  stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PointsRedemptionStatus =
  | 'pending'
  | 'delivered'
  | 'cancelled';

export interface PointsRedemption {
  id: string;
  user_id: string;
  user_name: string;
  user_email?: string;
  product_id?: string | null;
  product_name: string;
  points_cost: number;
  status: PointsRedemptionStatus;
  delivered_by?: string | null;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
}
export type ServiceScaleGender = 'male' | 'female';

export interface ServiceScalePerson {
  id: string;
  name: string;
  gender: ServiceScaleGender;
  phone?: string | null;
  sector?: string | null;
  is_active: boolean;
  does_trail: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceScaleConfig {
  title: string;
  startAt: string;
  endAt: string;
  shiftMinutes: number;
  menPerShift: number;
  womenPerShift: number;
  minRestMinutes: number;
  avoidConsecutive: boolean;
}

export interface GeneratedScaleSlot {
  slotNumber: number;
  startAt: string;
  endAt: string;
  men: ServiceScalePerson[];
  women: ServiceScalePerson[];
}

export interface ServiceScaleSchedule {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  shift_minutes: number;
  men_per_shift: number;
  women_per_shift: number;
  min_rest_minutes: number;
  avoid_consecutive: boolean;
  status: 'draft' | 'published';
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceScaleAssignment {
  id: string;
  schedule_id: string;
  person_id?: string | null;
  person_name: string;
  gender: ServiceScaleGender;
  slot_number: number;
  slot_start: string;
  slot_end: string;
  accommodation: 'male' | 'female';
  created_at: string;
}

export type PublicPanelCategory = 'notice' | 'scale' | 'info' | 'urgent';

export interface PublicPanelItem {
  id: string;
  title: string;
  content: string;
  category: PublicPanelCategory;
  image_url?: string | null;
  is_active: boolean;
  is_pinned: boolean;
  publish_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}
