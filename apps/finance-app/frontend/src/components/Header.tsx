import { House, RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";
import { appBase } from "@/lib/api";
import { PAGE_TITLES } from "@/lib/nav";
import { useSnapshot, useRefresh } from "@/lib/queries";
import { Button } from "./ui/Button";
import { Pill } from "./ui/Pill";
import { ConnectBankButton } from "./PlaidConnect";
import { useToast } from "./ui/Toast";
import { cn } from "@/lib/utils";

export function Header() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? "Finances";
  const { data: snapshot } = useSnapshot();
  const refresh = useRefresh();
  const { show: toast } = useToast();
  const connected = snapshot?.connected ?? false;
  const needsReconnect = snapshot?.needs_reconnect ?? false;

  return (
    <header className={cn(
      "z-30 shrink-0 border-b border-hairline bg-canvas/90 px-4 pb-3 backdrop-blur lg:px-8 lg:pb-4",
      appBase ? "pt-[calc(env(safe-area-inset-top,0px)+1.125rem)]" : "pt-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.375rem))]",
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent lg:hidden">
            Finances
          </p>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:gap-4">
          <div className="hidden items-center gap-3 lg:flex">
            {snapshot?.last_refreshed ? (
              <span className="text-xs text-ink-faint">
                Updated {new Date(snapshot.last_refreshed).toLocaleString()}
              </span>
            ) : null}
            <Pill
              tone={needsReconnect ? "loss" : connected ? "gain" : "neutral"}
            >
              {needsReconnect
                ? "Needs reconnect"
                : connected
                  ? "Connected"
                  : "Not connected"}
            </Pill>
            <Button
              variant="ghost"
              size="sm"
              disabled={!connected || refresh.isPending}
              onClick={() =>
                refresh.mutate(undefined, {
                  onError: (e: Error) => toast(e.message, "error"),
                })
              }
            >
              <RefreshCw
                className={cn("h-4 w-4", refresh.isPending && "animate-spin")}
              />
              {refresh.isPending ? "Refreshing\u2026" : "Refresh"}
            </Button>
            <ConnectBankButton
              variant="primary"
              update={connected}
              label={
                needsReconnect
                  ? "Reconnect bank"
                  : connected
                    ? "Reconnect"
                    : "Connect Bank"
              }
            />
          </div>

          {/* Mobile: compact status only — actions live in expandable nav */}
          <div className="lg:hidden">
            <Pill
              tone={needsReconnect ? "loss" : connected ? "gain" : "neutral"}
            >
              {needsReconnect ? "Reconnect" : connected ? "Live" : "Offline"}
            </Pill>
          </div>
          {appBase && (
            <a href="/" aria-label="Back to NOVA" title="Back to NOVA"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-hairline bg-card text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent">
              <House className="size-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
