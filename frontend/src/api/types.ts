export type Role = 'access_controller' | 'access_admin' | 'user';

export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'user', label: 'User', description: 'Creates and tracks their own access requests.' },
  { value: 'access_admin', label: 'Access Admin', description: 'Gate staff. Can view every request and its status, but cannot change anything.' },
  { value: 'access_controller', label: 'Access Controller', description: 'Reviews requests and manages users and their roles.' },
];

export const ROLE_LABEL: Record<Role, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label])) as Record<Role, string>;

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  role_label: string;
  is_active: boolean;
  created_at: string | null;
  last_login_at: string | null;
  request_counts?: Record<Exclude<Status, 'DRAFT'>, number>;
}

export type Status = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'TERMINATED' | 'EXPIRED';
export type IdCard = 'vistor' | 'parmanent' | 'not_applicable';

export const ID_CARD_OPTIONS: { value: IdCard; label: string }[] = [
  { value: 'vistor', label: 'Visitor ID' },
  { value: 'parmanent', label: 'Permanent ID' },
  { value: 'not_applicable', label: 'Not applicable' },
];

export interface AccessRequest {
  id: number;
  request_no: string | null;
  /** Shared by requests raised together for a party of visitors. */
  group_no: string | null;
  fullname: string;
  company: string;
  host: string;
  /** Legacy: no longer collected, present on older requests. */
  job_role: string;
  email: string;
  phone: string;
  id_card: IdCard | null;
  id_card_label: string | null;
  expected_date: string | null;
  departure_date: string | null;
  duration: string;
  /** Legacy: no longer collected, present on older requests. */
  location: string;
  purpose: string;
  status: Status;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  created_by: { id: number; full_name: string; email: string } | null;
  document_count: number;
}

export interface AccessRequestDetail extends AccessRequest {
  documents: { name: string; label: string }[];
  review_note: string | null;
  reviewed_at: string | null;
  expired_at: string | null;
  reviewed_by: { id: number; full_name: string } | null;
  allowed_transitions: Status[];
}

export interface GroupSummary {
  group_no: string;
  created_by: { id: number; full_name: string; email: string } | null;
  submitted_at: string | null;
  host: string;
  purpose: string;
  expected_date: string | null;
  departure_date: string | null;
  size: number;
  counts: Partial<Record<Status, number>>;
  requests: (AccessRequest & { allowed_transitions: Status[] })[];
}

export interface Page<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  pages: number;
}

export interface Stats {
  counts: Record<Status, number>;
  total: number;
}
