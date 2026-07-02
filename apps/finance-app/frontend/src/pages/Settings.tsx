import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  useSettings,
  usePutSettings,
  useSnapshot,
  useRefresh,
  useRules,
  useRuleMutations,
} from "@/lib/queries";
import type { MappingRule } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Label } from "@/components/ui/Field";
import { SubcategorySelect } from "@/components/SubcategorySelect";
import { ConnectBankButton } from "@/components/PlaidConnect";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MATCH_TYPES = [
  { value: "name_contains", label: "Description contains" },
  { value: "pfc_primary", label: "Plaid category (primary)" },
  { value: "pfc_detailed", label: "Plaid category (detailed)" },
] as const;

function matchTypeLabel(type: MappingRule["match_type"]): string {
  return MATCH_TYPES.find((m) => m.value === type)?.label ?? type;
}

function AddRuleModal({ onClose }: { onClose: () => void }) {
  const { createRule } = useRuleMutations();
  const { show: toast } = useToast();
  const [matchType, setMatchType] =
    useState<(typeof MATCH_TYPES)[number]["value"]>("name_contains");
  const [matchValue, setMatchValue] = useState("");
  const [subId, setSubId] = useState<number | null>(null);
  const [priority, setPriority] = useState("0");

  const submit = () => {
    if (!matchValue.trim()) {
      toast("Enter a match value", "error");
      return;
    }
    if (subId == null) {
      toast("Choose a subcategory", "error");
      return;
    }
    createRule.mutate(
      {
        match_type: matchType,
        match_value: matchValue.trim(),
        subcategory_id: subId,
        priority: parseInt(priority, 10) || 0,
      },
      {
        onSuccess: () => {
          toast("Rule added");
          onClose();
        },
        onError: (e: Error) => toast(e.message, "error"),
      },
    );
  };

  return (
    <Modal
      title="Add categorization rule"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={createRule.isPending} onClick={submit}>
            {createRule.isPending ? "Saving…" : "Add rule"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>When</Label>
          <Select
            value={matchType}
            onChange={(e) =>
              setMatchType(e.target.value as typeof matchType)
            }
          >
            {MATCH_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Matches</Label>
          <Input
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
            placeholder={
              matchType === "name_contains"
                ? "e.g. Starbucks"
                : "e.g. FOOD_AND_DRINK"
            }
          />
        </div>
        <div>
          <Label>Assign to</Label>
          <SubcategorySelect
            value={subId}
            onChange={setSubId}
            includeUnassigned={false}
            placeholder="Choose subcategory…"
          />
        </div>
        <div>
          <Label>Priority</Label>
          <Input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-faint">
            Lower numbers run first. Manual overrides always win.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export function Settings() {
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const putSettings = usePutSettings();
  const { data: snapshot } = useSnapshot();
  const refresh = useRefresh();
  const { data: rulesData, isLoading: rulesLoading } = useRules();
  const { deleteRule } = useRuleMutations();
  const { show: toast } = useToast();
  const [startMonth, setStartMonth] = useState(5);
  const [addRuleOpen, setAddRuleOpen] = useState(false);

  useEffect(() => {
    if (settings?.budget_year_start_month != null) {
      setStartMonth(settings.budget_year_start_month);
    }
  }, [settings?.budget_year_start_month]);

  const saveStartMonth = (month: number) => {
    setStartMonth(month);
    putSettings.mutate(
      { budget_year_start_month: month },
      {
        onSuccess: () => toast("Budget year updated"),
        onError: (e: Error) => toast(e.message, "error"),
      },
    );
  };

  const connected = snapshot?.connected ?? false;
  const rules = rulesData?.rules ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Budget year"
          subtitle="Which month your budget cycle starts"
        />
        {settingsLoading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : (
          <>
            <Select
              className="max-w-xs"
              value={String(startMonth)}
              onChange={(e) => saveStartMonth(Number(e.target.value))}
              disabled={putSettings.isPending}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-xs text-ink-faint">
              Budget, Spending, and Transactions views use a rolling year starting
              in {MONTH_NAMES[startMonth - 1]}.
            </p>
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Bank connection"
          subtitle="Sync balances and transactions from Plaid"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Pill tone={connected ? "gain" : "neutral"}>
            {connected ? "Connected" : "Not connected"}
          </Pill>
          {snapshot?.last_refreshed ? (
            <span className="text-sm text-ink-muted">
              Last synced{" "}
              {new Date(snapshot.last_refreshed).toLocaleString()}
            </span>
          ) : (
            <span className="text-sm text-ink-muted">Never synced</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!connected || refresh.isPending}
            onClick={() =>
              refresh.mutate(undefined, {
                onSuccess: () => toast("Data refreshed"),
                onError: (e: Error) => toast(e.message, "error"),
              })
            }
          >
            <RefreshCw
              className={cn("h-4 w-4", refresh.isPending && "animate-spin")}
            />
            {refresh.isPending ? "Refreshing…" : "Refresh now"}
          </Button>
          <ConnectBankButton
            variant="ghost"
            label={connected ? "Add or reconnect" : "Connect bank"}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Auto-categorization rules"
          subtitle="Map Plaid categories or merchant names to your budget subcategories"
          action={
            <Button size="sm" onClick={() => setAddRuleOpen(true)}>
              <Plus className="h-4 w-4" />
              Add rule
            </Button>
          }
        />
        {rulesLoading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No rules yet. Add one to automatically categorize matching
            transactions. You can still override any transaction manually.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-faint">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Matches</th>
                  <th className="pb-2 font-medium">Assign to</th>
                  <th className="pb-2 font-medium">Priority</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-3 text-ink-muted">
                      {matchTypeLabel(r.match_type)}
                    </td>
                    <td className="py-2.5 pr-3 font-medium">{r.match_value}</td>
                    <td className="py-2.5 pr-3">
                      {r.category_name ? `${r.category_name} / ` : ""}
                      {r.subcategory_name ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 tnum">{r.priority}</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          deleteRule.mutate(r.id, {
                            onSuccess: () => toast("Rule deleted"),
                            onError: (e: Error) => toast(e.message, "error"),
                          })
                        }
                        className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-loss/10 hover:text-loss"
                        aria-label="Delete rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {addRuleOpen ? (
        <AddRuleModal onClose={() => setAddRuleOpen(false)} />
      ) : null}
    </div>
  );
}
