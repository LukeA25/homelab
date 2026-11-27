import { useEffect, useState } from "react";

declare global {
  interface Window {
    HomelabNotify?: {
      subscribed(): Promise<boolean>;
      enable(): Promise<{ ok: boolean; reason?: string }>;
      disable(): Promise<{ ok: boolean }>;
    };
  }
}

export function NovaNotifications() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const response = await fetch("/__notify/vapid", { signal: controller.signal });
      const client = window.HomelabNotify;
      if (response.ok && client) {
        const enabled = await client.subscribed();
        if (!controller.signal.aborted) setSubscribed(enabled);
      }
    }
    // A Home-only device can't subscribe to Homework notifications.
    void load().catch(() => {});
    return () => controller.abort();
  }, []);

  async function toggle() {
    const client = window.HomelabNotify;
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const result = subscribed ? await client.disable() : await client.enable();
      if (!result.ok) {
        throw new Error("reason" in result && typeof result.reason === "string"
          ? result.reason : "Could not update notifications.");
      }
      setSubscribed(!subscribed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (subscribed === null) return null;
  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" className="text-sm text-ink-muted underline hover:text-ink"
        onClick={toggle} disabled={busy}>
        {subscribed ? "Disable NOVA notifications" : "Enable NOVA notifications"}
      </button>
      {error && <p role="status" className="text-xs text-ink-muted">{error}</p>}
    </div>
  );
}
