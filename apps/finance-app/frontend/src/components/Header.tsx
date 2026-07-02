import { RefreshCw } from "lucide-react";
import { useSnapshot, useRefresh } from "@/lib/queries";
import { Button } from "./ui/Button";
import { Pill } from "./ui/Pill";
import { ConnectBankButton } from "./PlaidConnect";
import { cn } from "@/lib/utils";

export function Header({ title }: { title: string }) {
  const { data: snapshot } = useSnapshot();
  const refresh = useRefresh();
  const connected = snapshot?.connected ?? false;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-hairline bg-canvas/80 px-8 py-4 backdrop-blur">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        {snapshot?.last_refreshed ? (
          <span className="hidden text-xs text-ink-faint sm:inline">
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
    </header>
  );
}
