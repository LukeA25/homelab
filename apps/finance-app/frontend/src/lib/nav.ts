import {
  LayoutDashboard,
  PieChart,
  Wallet,
  ReceiptText,
  Landmark,
  LineChart,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Primary bottom-tab destinations on mobile. */
  mobilePrimary?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, mobilePrimary: true },
  { to: "/spending", label: "Spending", icon: PieChart, mobilePrimary: true },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/transactions", label: "Transactions", icon: ReceiptText, mobilePrimary: true },
  { to: "/investments", label: "Investments", icon: LineChart, mobilePrimary: true },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const MOBILE_PRIMARY = NAV.filter((item) => item.mobilePrimary);
export const MOBILE_SECONDARY = NAV.filter((item) => !item.mobilePrimary);

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV.map((item) => [item.to, item.label]),
);
