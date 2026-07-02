import { NavLink } from "react-router-dom";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-hairline bg-card lg:flex">
      <div className="px-6 py-6 text-xl font-bold tracking-tight">
        Fin<span className="text-accent">ances</span>
      </div>
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent-soft text-accent"
                      : "text-ink-muted hover:bg-black/[0.03] hover:text-ink",
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="px-6 py-4 text-xs text-ink-faint">Homelab Finance</div>
    </aside>
  );
}
