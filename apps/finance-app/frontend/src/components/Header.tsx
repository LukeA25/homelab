import { RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";
import { PAGE_TITLES } from "@/lib/nav";
import { useSnapshot, useRefresh } from "@/lib/queries";
import { Button } from "./ui/Button";
import { Pill } from "./ui/Pill";
import { ConnectBankButton } from "./PlaidConnect";
import { cn } from "@/lib/utils";

export function Header() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? "Finances";
  const { data: snapshot } = useSnapshot();
  const refresh = useRefresh();
  const connected = snapshot?.connected ?? false;

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/90 px-4 py-3 backdrop-blur lg:px-8 lg:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent lg:hidden">
            Finances
          </p>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </div>

        {/* Desktop actions — unchanged from before */}
        <div className="hidden items-center gap-3 lg:flex">
          {snapshot?.last_refreshed ? (
            <span className="text-xs text-ink-faint">
              Updated {new Date(snapshot.last_refreshed).toLocaleString()}
            </span>
          ) : null}
          <Pill tone={connected ? "gain" : "neutral"}>
            {connected ? "Connected" : "Not connected"}
          </Pill>
          <Button
            variant="ghost"
            size="sm"
            disabled={!connected || refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw
              className={cn("h-4 w-4", refresh.isPending && "animate-spin")}
            />
            {refresh.isPending ? "Refreshing\u2026" : "Refresh"}
          </Button>
          <ConnectBankButton
            variant="primary"
            label={connected ? "Reconnect" : "Connect Bank"}
          />
        </div>

        {/* Mobile: compact status only — actions live in expandable nav */}
        <div className="lg:hidden">
          <Pill tone={connected ? "gain" : "neutral"}>
            {connected ? "Live" : "Offline"}
          </Pill>
        </div>
      </div>
    </header>
  );
}
