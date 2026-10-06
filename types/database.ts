export interface Employer {
  id: string;
  prenom: string;
  nom: string;
  email?: string;
  phone?: string;
  address?: string;
  profession?: string;
  qr_code: string;
  profile_picture?: string;
  staff_type?: string;
  user_id?: string;
  created_at?: string;
  vehicles?: Vehicle[];
}

export interface Visiteur {
  id: string;
  prenom: string;
  nom: string;
  email?: string;
  phone?: string;
  address?: string;
  profession?: string;
  qr_code: string;
  profile_picture?: string;
  staff_type?: string;
  user_id?: string;
  created_at?: string;
  vehicles?: Vehicle[];
}

export interface VehicleStaff {
  id: string;
  vehicle_id: string;
  staff_id: string;
  staff_type: string; // 'employee' | 'visitor'
  created_at?: string;
  user_id?: string;
  // Joined data
  employer?: Employer;
  visiteur?: Visiteur;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  model?: string;
  color?: string;
  picture?: string;
  qr_code: string;
  employer_id?: string | null;
  visiteur_id?: string | null;
  user_id?: string;
  created_at?: string;
  // Joined data
  employer?: Employer;
  visiteur?: Visiteur;
  vehicle_staff?: VehicleStaff[];
}

export interface HistoryInsert {
  type: 'enter' | 'exit';
  employer_id?: string | null;
  visiteur_id?: string | null;
  vehicle_id?: string | null;
  destination?: string;
  timestamp?: string;
}

export interface PatrolLocation {
  id: string;
  name: string;
  description?: string;
  location_code?: string;
  code?: string;
  qr_code: string;
  latitude?: number;
  longitude?: number;
  patrol_times?: string;
  is_active: boolean;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  image_url?: string;
  schedule?: string;
  patrol_schedule?: string;
}

export interface PatrolScan {
  id: string;
  patrol_location_id: string;
  staff_id?: string;
  staff_type?: string; // 'employer' | 'visiteur'
  scanned_at: string;
  notes?: string;
  user_id?: string;
  created_at?: string;
  image_url?: string;
}

export type ScanResult =
  | { type: 'employer'; data: Employer }
  | { type: 'visiteur'; data: Visiteur }
  | { type: 'vehicle'; data: Vehicle }
  | { type: 'patrol_location'; data: PatrolLocation }
  | { type: 'not_found'; code: string };
