import { useState } from "react";
import { api } from "@/lib/api";
import { useConnectBank, useRefresh } from "@/lib/queries";
import { useToast } from "./ui/Toast";
import { Button } from "./ui/Button";

export type LinkMode = "all" | "bank" | "investments";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForPopupClose(popup: Window): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        resolve();
      }
    }, 400);
  });
}

async function waitForSession(linkToken: string) {
  for (let i = 0; i < 8; i++) {
    const status = await api.linkSessionStatus(linkToken);
    if (status.finished || status.public_token || status.error) return status;
    await sleep(700);
  }
  return api.linkSessionStatus(linkToken);
}

// Hosted Link opens on Plaid's domain so Bank of America OAuth can complete.
// Embedded Link dies with "Internal error occurred" here because this app has
// no redirect URI in the Plaid dashboard. Update mode must not exchange the
// public token — that would create a new Item and drop category overrides.
export function ConnectBankButton({
  label = "Connect Bank",
  variant = "primary",
  mode = "all",
  update = false,
}: {
  label?: string;
  variant?: "primary" | "ghost";
  mode?: LinkMode;
  update?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const connect = useConnectBank();
  const refresh = useRefresh();
  const { show: toast } = useToast();

  const onClick = async () => {
    const popup = window.open(
      "about:blank",
      "plaid-link",
      "popup=yes,width=440,height=760",
    );
    if (!popup) {
      toast(
        "Allow popups for this site, then click Reconnect again so Bank of America can open.",
        "error",
      );
      return;
    }
    try {
      popup.document.write("Opening Bank of America…");
    } catch {
      // Cross-origin or empty document; navigating next is enough.
    }

    setPending(true);
    try {
      const created = await api.createLinkToken(mode, { update });
      if (!created.hosted_link_url) {
        popup.close();
        throw new Error("Plaid did not return a Hosted Link URL");
      }
      popup.location.href = created.hosted_link_url;
      toast("Finish login in the Plaid window, then close it.");
      await waitForPopupClose(popup);
      const status = await waitForSession(created.link_token);

      if (status.error && !status.public_token) {
        throw new Error(
          status.error.display_message || status.error.error_message,
        );
      }

      if (update) {
        if (!status.finished && !status.public_token) {
          toast("Reconnect was not completed");
          return;
        }
        await refresh.mutateAsync();
        toast("Bank reconnected");
        return;
      }

      if (!status.public_token) {
        toast("Bank connection was not completed");
        return;
      }
      await connect.mutateAsync(status.public_token);
      toast("Bank connected");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Plaid Link failed";
      toast(message, "error");
      try {
        popup.close();
      } catch {
        // already closed
      }
    } finally {
      setPending(false);
    }
  };

  const busy = pending || connect.isPending || refresh.isPending;

  return (
    <Button variant={variant} onClick={() => void onClick()} disabled={busy}>
      {busy ? (update ? "Reconnecting\u2026" : "Connecting\u2026") : label}
    </Button>
  );
}
