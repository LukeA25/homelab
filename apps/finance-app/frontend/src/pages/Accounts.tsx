import { useMemo, useState } from "react";
import { Landmark, TrendingUp, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useSnapshot, useDeleteAccount } from "@/lib/queries";
import type { AccountSnapshot } from "@/lib/types";
import { isInvestmentAccount } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { ConnectBankButton } from "@/components/PlaidConnect";
import { useToast } from "@/components/ui/Toast";
import { cn, money } from "@/lib/utils";

const BANK_TYPE_LABELS: Record<string, string> = {
  depository: "Cash",
  credit: "Credit",
  loan: "Loans",
  other: "Other",
};

function bankTypeLabel(type: string | null): string {
  if (!type) return "Other";
  return BANK_TYPE_LABELS[type.toLowerCase()] ?? type.replace(/_/g, " ");
}

function accountTitle(a: AccountSnapshot): string {
  return a.official_name || a.name || "Account";
}

function balance(a: AccountSnapshot): number {
  return a.current_balance ?? a.available_balance ?? 0;
}

function AccountRow({
  account,
  investment = false,
  onRemove,
}: {
  account: AccountSnapshot;
  investment?: boolean;
  onRemove: () => void;
}) {
  const bal = balance(account);
  const avail =
    account.available_balance != null &&
    account.current_balance != null &&
    account.available_balance !== account.current_balance
      ? account.available_balance
      : null;
  const Icon = investment ? TrendingUp : Landmark;

  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            investment ? "bg-gain/10" : "bg-black/[0.04]",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              investment ? "text-gain" : "text-ink-muted",
            )}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{accountTitle(account)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {account.mask ? (
              <span className="text-xs text-ink-faint">•••• {account.mask}</span>
            ) : null}
            <Pill tone={investment ? "gain" : "neutral"}>
              {investment ? "Investment" : bankTypeLabel(account.type)}
            </Pill>
            {account.subtype ? (
              <span className="text-xs capitalize text-ink-faint">
                {account.subtype.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>
          {avail != null ? (
            <p className="mt-1 text-xs text-ink-faint">
              Available {money(avail)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="tnum text-base font-semibold">{money(bal)}</span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-loss/10 hover:text-loss"
          aria-label={`Remove ${accountTitle(account)}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function RemoveAccountModal({
  account,
  onClose,
}: {
  account: AccountSnapshot;
  onClose: () => void;
}) {
  const remove = useDeleteAccount();
  const { show: toast } = useToast();
  const investment = isInvestmentAccount(account);

  const confirm = () => {
    remove.mutate(account.id, {
      onSuccess: () => {
        toast("Account removed");
        onClose();
      },
      onError: (e: Error) => toast(e.message, "error"),
    });
  };

  return (
    <Modal
      title="Remove account?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-loss hover:bg-loss/90"
            disabled={remove.isPending}
            onClick={confirm}
          >
            {remove.isPending ? "Removing…" : "Remove account"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{accountTitle(account)}</span>
        {account.mask ? ` (•••• ${account.mask})` : ""} and all of its{" "}
        {investment ? "holdings and investment activity" : "transactions"} will
        be deleted from this app. This does not close the account at your bank.
      </p>
    </Modal>
  );
}

function groupBankAccounts(accounts: AccountSnapshot[]) {
  const groups = new Map<string, AccountSnapshot[]>();
  for (const a of accounts) {
    const key = (a.type || "other").toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const order = ["depository", "credit", "loan", "other"];
  return [...groups.entries()].sort(([a], [b]) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function Accounts() {
  const { data: snapshot, isLoading } = useSnapshot();
  const [toRemove, setToRemove] = useState<AccountSnapshot | null>(null);

  const accounts = snapshot?.accounts ?? [];

  const { banking, investments } = useMemo(() => {
    const banking: AccountSnapshot[] = [];
    const investments: AccountSnapshot[] = [];
    for (const a of accounts) {
      if (isInvestmentAccount(a)) investments.push(a);
      else banking.push(a);
    }
    return { banking, investments };
  }, [accounts]);

  const bankingTotal = banking.reduce((sum, a) => sum + balance(a), 0);
  const investmentTotal = investments.reduce((sum, a) => sum + balance(a), 0);
  const bankGroups = useMemo(() => groupBankAccounts(banking), [banking]);

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  if (!snapshot?.connected || accounts.length === 0) {
    return (
      <Card className="flex min-h-[300px] flex-col items-center justify-center text-center">
        <h2 className="text-xl font-semibold">Link your accounts</h2>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          Connect bank accounts for spending and budgeting, or investment accounts
          for portfolio tracking.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <ConnectBankButton mode="bank" label="Connect bank" />
          <ConnectBankButton
            mode="investments"
            variant="ghost"
            label="Connect investments"
          />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Banking" value={money(bankingTotal)} />
        <StatCard label="Investments" value={money(investmentTotal)} tone="gain" />
        <StatCard label="Bank accounts" value={String(banking.length)} />
        <StatCard label="Investment accounts" value={String(investments.length)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <ConnectBankButton mode="bank" label="Add bank account" />
        <ConnectBankButton
          mode="investments"
          variant="ghost"
          label="Add investment account"
        />
      </div>

      {bankGroups.length > 0 ? (
        bankGroups.map(([type, list]) => (
          <Card key={type}>
            <CardHeader
              title={bankTypeLabel(type)}
              subtitle={`${list.length} account${list.length === 1 ? "" : "s"}`}
            />
            <div className="divide-y divide-hairline">
              {list.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  onRemove={() => setToRemove(a)}
                />
              ))}
            </div>
          </Card>
        ))
      ) : null}

      {investments.length > 0 ? (
        <Card>
          <CardHeader
            title="Investments"
            subtitle={`${investments.length} account${investments.length === 1 ? "" : "s"}`}
            action={
              <Link
                to="/investments"
                className="text-sm font-medium text-accent hover:underline"
              >
                View portfolio
              </Link>
            }
          />
          <div className="divide-y divide-hairline">
            {investments.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                investment
                onRemove={() => setToRemove(a)}
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardHeader title="Investments" subtitle="No investment accounts linked" />
          <p className="text-sm text-ink-muted">
            Connect a brokerage or retirement account to track holdings on the{" "}
            <Link to="/investments" className="text-accent hover:underline">
              Investments
            </Link>{" "}
            page.
          </p>
          <div className="mt-3">
            <ConnectBankButton
              mode="investments"
              variant="ghost"
              label="Connect investment account"
            />
          </div>
        </Card>
      )}

      <p className="text-xs text-ink-faint">
        Removing an account deletes its data locally. Investment accounts also
        remove cached holdings.
      </p>

      {toRemove ? (
        <RemoveAccountModal account={toRemove} onClose={() => setToRemove(null)} />
      ) : null}
    </div>
  );
}
