export type Role = 'owner' | 'staff';

export interface Cafe {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  primary_color: string;
  currency: string;
  status: 'active' | 'suspended';
  links?: CafeLinks | null;
}

export interface CafeLinks {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  maps?: string;
  phone?: string;
}

export interface Category {
  id: string;
  cafe_id: string;
  name: string;
  name_fil: string | null;
  position: number;
  layout?: 'list' | 'grid';
  /** Where this category's orders are made: drinks at the bar, food in the kitchen. */
  station?: Station;
}

export interface ItemOption {
  name: string;
  name_fil?: string | null;
  price: number;
}

export interface Item {
  id: string;
  cafe_id: string;
  category_id: string;
  name: string;
  name_fil: string | null;
  description: string | null;
  description_fil: string | null;
  price: number;
  photo_url: string | null;
  tags: string[];
  options: ItemOption[];
  available: boolean;
  position: number;
  badge?: string | null;
  prep_minutes?: number | null;
  calories?: number | null;
}

export interface CafeTable {
  id: string;
  cafe_id: string;
  number: number;
  label: string | null;
  token: string;
  active: boolean;
}

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type Station = 'bar' | 'kitchen';
/** One order line's progress at its station. */
export type ItemStatus = 'new' | 'preparing' | 'ready';

export interface OrderItem {
  id: string;
  name: string;
  unit_price: number;
  qty: number;
  options: ItemOption[];
  /** Copied from the item's category when the order was placed (missing on databases without 0005). */
  station?: Station;
  status?: ItemStatus;
}

export interface Order {
  id: string;
  cafe_id: string;
  table_id: string;
  session_id: string;
  number: number;
  status: OrderStatus;
  note: string | null;
  total: number;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
  cafe_tables: { number: number; label: string | null } | null;
}

export interface ServiceRequest {
  id: string;
  table_id: string;
  kind: 'waiter' | 'bill';
  status: 'open' | 'done';
  created_at: string;
  cafe_tables: { number: number; label: string | null } | null;
}

export interface TableSession {
  id: string;
  table_id: string;
  status: 'open' | 'paid';
  opened_at: string;
  cafe_tables: { number: number; label: string | null } | null;
}

export interface Member {
  cafe_id: string;
  user_id: string;
  role: Role;
  display_name: string | null;
  email: string | null;
  created_at: string;
}
