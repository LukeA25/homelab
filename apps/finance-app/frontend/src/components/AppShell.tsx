import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/cash-flow": "Cash Flow",
  "/budget": "Budget",
  "/transactions": "Transactions",
  "/accounts": "Accounts",
  "/settings": "Settings",
};

export function AppShell() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "PayTrack";

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
