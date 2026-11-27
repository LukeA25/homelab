import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";

export function AppShell() {
  return (
    <div className="flex h-full flex-col overflow-hidden supports-[height:100dvh]:h-dvh">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 lg:px-8 lg:py-6">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
