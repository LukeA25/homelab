export interface Room {
  id: string;
  name: string;
  entities: string[];
  on: boolean;
  brightness_pct: number | null;
  rgb_color: number[] | null;
  color_temp_kelvin: number | null;
  supported_color_modes: string[];
  available: boolean;
  lights_on: number;
  lights_total: number;
}

export interface Weather {
  entity_id: string;
  state: string;
  temperature: number | null;
  temperature_unit: string;
  humidity: number | null;
  wind_speed: number | null;
  friendly_name: string;
  forecast: unknown[];
}

export interface FinanceTrack {
  name: string;
  spent: number;
  budgeted: number;
  remaining: number;
  pct_used: number;
  subcategories: {
    name: string;
    spent: number;
    budgeted: number;
    remaining: number;
    pct_used: number;
  }[];
}

export interface FinanceSummary {
  connected: boolean;
  month: string | null;
  month_label: string | null;
  spent: number;
  budgeted: number;
  remaining: number;
  pct_used: number;
  focus: FinanceTrack[];
  cash_total: number;
  updated_at?: string | null;
  href: string;
  error?: string;
}

export interface ServiceItem {
  name: string;
  href: string;
  icon: string;
  description: string;
  health: string | null;
  status: "up" | "down" | "unknown";
}

export interface ServiceGroup {
  group: string;
  services: ServiceItem[];
}

export interface Assignment {
  id: number;
  title: string;
  course_code: string;
  course_name: string;
  color: string;
  due: string;
  source: string;
  day_label: string;
  time_label: string;
  days_until: number | null;
  overdue: boolean;
}

export interface HomeworkResponse {
  connected: boolean;
  assignments: Assignment[];
  overdue_count: number;
  upcoming_count: number;
  total?: number;
}

export interface SystemStats {
  cpu_pct: number;
  cpu_cores: number;
  load: number[];
  mem_used: number;
  mem_total: number;
  mem_pct: number;
  disk_used: number;
  disk_total: number;
  disk_pct: number;
  uptime_seconds: number;
  cpu_history: number[];
  mem_history: number[];
  updated_at: number;
}

export interface AppConfig {
  tz: string;
}
