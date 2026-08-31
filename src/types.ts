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
  retreat_count?: number;
  retreat_count_manual?: number | null;
  photo_url?: string | null;
  is_deleted?: boolean;

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
  file_url?: string | null;
  file_path?: string | null;
  file_name: string;
  file_type: string;
  status: PaymentReceiptStatus;
  type: 'inscription' | 'order';
  edition_id?: string | null;
  order_id?: string | null;
  observations?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface InscriptionOverview {
  participation_count: number;
  participation_count_is_manual: boolean;
  edition: {
    id: string;
    title: string;
    starts_at: string;
    ends_at?: string | null;
    location?: string | null;
    amount: number;
    status: 'draft' | 'scheduled' | 'open' | 'closed' | 'finished' | 'cancelled';
    is_active: boolean;
  } | null;
  enrollment: {
    id: string;
    enrollment_status: 'pending' | 'approved' | 'rejected' | 'exempt';
    payment_status: 'pending' | 'approved' | 'rejected' | 'exempt';
    paid_at?: string | null;
    will_participate: boolean | null;
    participation_responded_at?: string | null;
  } | null;
}

export type ShirtOrderStatus =
  | 'cart'
  | 'waiting_payment'
  | 'receipt_sent'
  | 'payment_approved'
  | 'payment_rejected'
  | 'delivered'
  | 'cancelled';

export interface ShirtImage {
  id: string;
  shirt_id: string;
  image_url: string;
  position_x: number;
  position_y: number;
  display_order: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface Shirt {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  stock: Record<string, number>;
  is_active: boolean;
  images?: ShirtImage[];
  created_at: string;
  updated_at: string;
}

export interface ShirtOrder {
  id: string;
  user_id: string;
  total_price: number;
  status: ShirtOrderStatus;
  proof_url?: string;
  proof_path?: string | null;
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
  departure_map_url?: string | null;
  departure_time?: string;
  total_seats: number;
  available_seats: number;
  vehicle_type?: string;
  status: RideStatus;
  notes?: string;
  confirmed_passenger_count?: number;
  completed_points_awarded: boolean;
  estimated_points?: number;
  awarded_points?: number;
  points_rule_snapshot?: {
    mode?: 'per_passenger' | 'fixed';
    points_per_passenger?: number;
    fixed_points?: number;
  };
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
  retreat_count?: number;
  retreat_count_manual?: number | null;
  photo_url?: string | null;
  is_deleted?: boolean;
  amount: number;
  reason: string;
  granted_by?: string | null;
  granted_by_name?: string;
  source_type?: string;
  source_id?: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export interface PointsStoreProductImage {
  id: string;
  product_id: string;
  image_url: string;
  position_x: number;
  position_y: number;
  display_order: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface PointsStoreProduct {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  points_cost: number;
  stock: number;
  is_active: boolean;
  images?: PointsStoreProductImage[];
  created_at: string;
  updated_at: string;
}

export type HonorGoalType = 'custom' | 'product';

export interface HonorGoal {
  user_id: string;
  goal_type: HonorGoalType;
  title: string;
  target_points: number;
  product_id?: string | null;
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
export type ServiceScaleType = 'accommodation' | 'main_gate';

export interface ServiceScalePerson {
  id: string;
  user_id?: string | null;
  name: string;
  /** Legacy records created from approved profiles may not have an accommodation yet. */
  gender: ServiceScaleGender | null;
  phone?: string | null;
  sector?: string | null;
  is_active: boolean;
  does_trail: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceScaleConfig {
  scaleType: ServiceScaleType;
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
  menRequired: number;
  womenRequired: number;
  men: ServiceScalePerson[];
  women: ServiceScalePerson[];
}

export interface ServiceScaleSlotRequirement {
  slotNumber: number;
  startAt: string;
  endAt: string;
  menRequired: number;
  womenRequired: number;
  enabled: boolean;
}

export interface ServiceScaleSchedule {
  id: string;
  edition_id?: string | null;
  service_unit_id?: string | null;
  scale_type: ServiceScaleType;
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
  deleted_at?: string | null;
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

export interface PublishedServiceScaleAssignment {
  schedule_id: string;
  schedule_title: string;
  scale_type: ServiceScaleType;
  service_unit_id: string;
  assignment_id: string;
  user_id?: string | null;
  person_name: string;
  gender: ServiceScaleGender;
  slot_number: number;
  slot_start: string;
  slot_end: string;
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

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message?: string;
  type?: string;
  is_read: boolean;
  read_at?: string | null;
  is_pinned: boolean;
  pinned_at?: string | null;
  cleared_at?: string | null;
  created_at: string;
}

export interface NotificationReceipt {
  id: string;
  title: string;
  message?: string | null;
  type?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  recipient_id: string;
  recipient_name: string;
  recipient_email: string;
  recipient_role: UserRole;
}

export type EventScheduleActivityType =
  | 'activity'
  | 'worship'
  | 'meal'
  | 'service'
  | 'transport'
  | 'break'
  | 'other';

export interface EventScheduleItem {
  id: string;
  edition_id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  activity_type: EventScheduleActivityType;
  team_names: string[];
  responsible?: string | null;
  responsible_id?: string | null;
  is_published: boolean;
  schedule_kind: 'activity' | 'route';
  duration_minutes?: number | null;
  route_order?: number | null;
  service_unit_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export type EventServiceUnitType = 'character' | 'sector' | 'location' | 'group' | 'scale';

export interface EventServiceUnit {
  id: string;
  edition_id: string;
  unit_type: EventServiceUnitType;
  name: string;
  description: string;
  color: string;
  min_people: number;
  max_people?: number | null;
  per_group: boolean;
  display_order: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventServicePosition {
  id: string;
  unit_id: string;
  name: string;
  description: string;
  min_people: number;
  max_people?: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventServiceAssignment {
  id: string;
  edition_id: string;
  unit_id: string;
  position_id?: string | null;
  linked_character_id?: string | null;
  group_id?: string | null;
  user_id?: string | null;
  external_name: string;
  person_name: string;
  assignment_kind: 'staff' | 'participant';
  role_title: string;
  is_leader: boolean;
  is_primary: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  notes: string;
  display_order: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventServiceSlot {
  id: string;
  edition_id: string;
  unit_id: string;
  location_id?: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  notes: string;
  display_order: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventServicePersonOption {
  user_id: string;
  display_name: string;
  email: string;
  role: UserRole;
  primary_team: string;
}

export interface EventServicesSnapshot {
  units: EventServiceUnit[];
  positions: EventServicePosition[];
  assignments: EventServiceAssignment[];
  slots: EventServiceSlot[];
}

export type TrailMovementStatus =
  | 'not_started'
  | 'at_station'
  | 'moving'
  | 'holding'
  | 'delayed'
  | 'finished';

export type TrailTrafficSignal = 'clear' | 'hold' | 'attention';

export type TrailStationKind = 'station' | 'gate' | 'qg' | 'field' | 'reveal' | 'hold';

export interface TrailMapStation {
  id: string;
  edition_id: string;
  service_unit_id?: string | null;
  station_key: string;
  label: string;
  short_label: string;
  station_kind: TrailStationKind;
  x_percent: number;
  y_percent: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrailMapConnection {
  id: string;
  edition_id: string;
  from_station_id: string;
  to_station_id: string;
  connection_kind: 'trail' | 'connector' | 'hold';
  is_bidirectional: boolean;
  display_order: number;
  created_at: string;
}

export interface TrailGroupTraffic {
  id: string;
  edition_id: string;
  group_id: string;
  station_id?: string | null;
  origin_station_id?: string | null;
  destination_station_id?: string | null;
  marker_x: number;
  marker_y: number;
  movement_status: TrailMovementStatus;
  traffic_signal: TrailTrafficSignal;
  delay_minutes: number;
  notes: string;
  updated_by?: string | null;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface TrailGroupTrafficHistory {
  id: number;
  traffic_id: string;
  edition_id: string;
  group_id: string;
  station_id?: string | null;
  origin_station_id?: string | null;
  destination_station_id?: string | null;
  marker_x: number;
  marker_y: number;
  movement_status: TrailMovementStatus;
  traffic_signal: TrailTrafficSignal;
  delay_minutes: number;
  notes: string;
  changed_by?: string | null;
  changed_by_name: string;
  changed_at: string;
}

export interface TrailRoutePlan {
  id: string;
  edition_id: string;
  group_id: string;
  starts_at: string;
  created_at: string;
  updated_at: string;
}

export interface TrailRoutePlanStep {
  id: string;
  plan_id: string;
  edition_id: string;
  group_id: string;
  station_id?: string | null;
  label: string;
  ideal_order: number;
  stay_minutes: number;
  travel_minutes: number;
  is_break: boolean;
  created_at: string;
  updated_at: string;
}

export type TrailRouteRunStatus = 'active' | 'finished';
export type TrailRouteStepStatus = 'pending' | 'current' | 'completed' | 'skipped';

export interface TrailRouteExecution {
  id: string;
  edition_id: string;
  group_id: string;
  plan_id?: string | null;
  run_status: TrailRouteRunStatus;
  started_at: string;
  finished_at?: string | null;
  schedule_variance_minutes: number;
  estimated_finish_at?: string | null;
  updated_by?: string | null;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface TrailRouteExecutionStep {
  id: string;
  execution_id: string;
  edition_id: string;
  group_id: string;
  plan_step_id?: string | null;
  station_id?: string | null;
  label: string;
  original_order: number;
  live_order: number;
  stay_minutes: number;
  travel_minutes: number;
  planned_arrival_at: string;
  eta_at: string;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  step_status: TrailRouteStepStatus;
  is_break: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrailTrafficSnapshot {
  stations: TrailMapStation[];
  connections: TrailMapConnection[];
  traffic: TrailGroupTraffic[];
  groups: EventServiceUnit[];
  routePlans: TrailRoutePlan[];
  routePlanSteps: TrailRoutePlanStep[];
  executions: TrailRouteExecution[];
  executionSteps: TrailRouteExecutionStep[];
}

export interface EventRouteRowInput {
  title: string;
  duration_minutes: number;
  location_id?: string | null;
  activity_type?: EventScheduleActivityType;
  description?: string;
}

export interface SchedulePersonOption {
  user_id: string;
  display_name: string;
  email: string;
  role: UserRole;
  primary_team?: string | null;
}

export interface RideSettings {
  singleton: boolean;
  points_mode: 'per_passenger' | 'fixed';
  points_per_passenger: number;
  fixed_points: number;
  event_address: string;
  event_map_url: string;
  updated_at: string;
}

export type AttendanceStatus = 'confirmed' | 'present' | 'absent' | 'excused';

export interface AttendanceRecord {
  participation_id?: string | null;
  enrollment_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  edition_id: string;
  retreat_title: string;
  attendance_status: AttendanceStatus;
  attendance_notes?: string | null;
  attendance_updated_at?: string | null;
}

export type EventScheduleItemInput = Omit<
  EventScheduleItem,
  | 'id'
  | 'created_by'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'schedule_kind'
  | 'duration_minutes'
  | 'route_order'
  | 'service_unit_id'
> & {
  schedule_kind?: 'activity' | 'route';
  duration_minutes?: number | null;
  route_order?: number | null;
  service_unit_id?: string | null;
};

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}


export type OfferStatus = 'pending' | 'approved' | 'rejected';
export type OfferMethod = 'pix' | 'card' | 'cash' | 'other';
export interface Offer {
  id: string;
  user_id: string;
  user_name: string;
  user_email?: string | null;
  amount: number;
  method: OfferMethod;
  objective: string;
  notes?: string | null;
  proof_url?: string | null;
  proof_path?: string | null;
  status: OfferStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type AutomatedMessageTarget = 'all' | 'approved' | 'pending' | 'leaders' | 'team';
export interface AutomatedMessage {
  id: string;
  title: string;
  message: string;
  target: AutomatedMessageTarget;
  target_team?: string | null;
  scheduled_at: string;
  status: 'scheduled' | 'sent' | 'cancelled' | 'failed';
  created_by?: string | null;
  sent_at?: string | null;
  sent_count?: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RetreatEventSettings {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  location?: string | null;
  active: boolean;
  registration_fee?: number;
  registration_open?: boolean;
  created_at: string;
  updated_at: string;
}

export interface RetreatParticipation {
  id: string;
  user_id: string;
  retreat_title: string;
  confirmed_by_payment_id?: string | null;
  confirmed_by?: string | null;
  confirmed_at: string;
  notes?: string | null;
  created_at: string;
}
