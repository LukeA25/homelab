import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronUp, RefreshCw } from "lucide-react";
import { MOBILE_PRIMARY, MOBILE_SECONDARY } from "@/lib/nav";
import { useSnapshot, useRefresh } from "@/lib/queries";
import { ConnectBankButton } from "@/components/PlaidConnect";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { data: snapshot } = useSnapshot();
  const refresh = useRefresh();
  const connected = snapshot?.connected ?? false;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const moreActive = MOBILE_SECONDARY.some(
    (item) =>
      pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to)),
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 bg-black/25 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="relative border-t border-hairline bg-card shadow-pop">
        <div
          className={cn(
            "overflow-hidden transition-[max-height] duration-300 ease-out",
            open ? "max-h-[min(70vh,520px)]" : "max-h-0",
          )}
        >
          <div className="border-b border-hairline px-4 pb-4 pt-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Menu</p>
              <button
                type="button"
                aria-label="Collapse menu"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-black/[0.04]"
              >
                <ChevronUp className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {MOBILE_SECONDARY.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent-soft text-accent"
                        : "bg-black/[0.03] text-ink hover:bg-black/[0.05]",
                    )
                  }
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>

            <div className="mt-4 space-y-3 border-t border-hairline pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={connected ? "gain" : "neutral"}>
                  {connected ? "Connected" : "Not connected"}
                </Pill>
                {snapshot?.last_refreshed ? (
                  <span className="text-xs text-ink-faint">
                    Updated {new Date(snapshot.last_refreshed).toLocaleString()}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!connected || refresh.isPending}
                  onClick={() => refresh.mutate()}
                >
                  <RefreshCw
                    className={cn("h-4 w-4", refresh.isPending && "animate-spin")}
                  />
                  {refresh.isPending ? "Refreshing…" : "Refresh"}
                </Button>
                <ConnectBankButton
                  variant="primary"
                  label={connected ? "Reconnect" : "Connect"}
                />
              </div>
            </div>
          </div>
        </div>

        <nav
          className="flex items-stretch bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
          aria-label="Mobile"
        >
          {MOBILE_PRIMARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-accent" : "text-ink-muted",
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate">{item.label.split(" ")[0]}</span>
            </NavLink>
          ))}

          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Collapse menu" : "Expand menu"}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors",
              open || moreActive ? "text-accent" : "text-ink-muted",
            )}
          >
            <ChevronUp
              className={cn(
                "h-5 w-5 transition-transform duration-300",
                open && "rotate-180",
              )}
            />
            More
          </button>
        </nav>
      </div>
    </div>
  );
}
