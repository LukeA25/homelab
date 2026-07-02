import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "@/lib/api";
import { useConnectBank } from "@/lib/queries";
import { Button } from "./ui/Button";

// Fetches a Plaid link token, opens Plaid Link, then exchanges the public
// token and triggers a refresh (see useConnectBank).
export function ConnectBankButton({
  label = "Connect Bank",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "ghost";
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connect = useConnectBank();

  useEffect(() => {
    let active = true;
    api
      .createLinkToken()
      .then((r) => {
        if (active) setToken(r.link_token);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const onSuccess = useCallback(
    (publicToken: string) => {
      connect.mutate(publicToken);
    },
    [connect],
  );

  const { open, ready } = usePlaidLink({ token, onSuccess });

  return (
    <Button
      variant={variant}
      onClick={() => open()}
      disabled={!ready || !token || connect.isPending}
      title={error ?? undefined}
    >
      {connect.isPending ? "Connecting\u2026" : label}
    </Button>
  );
}
