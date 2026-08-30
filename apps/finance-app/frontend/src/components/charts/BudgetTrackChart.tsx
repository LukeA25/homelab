import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { TrackingNode } from "@/lib/budgetTracking";
import { money } from "@/lib/utils";

export function BudgetTrackChart({
  node,
  labels,
  currentMonthIdx,
}: {
  node: TrackingNode;
  labels: string[];
  currentMonthIdx: number;
}) {
  const [mode, setMode] = useState<"monthly" | "cumulative">("cumulative");

  const option = useMemo(() => {
    if (mode === "cumulative") {
      return {
        grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
        tooltip: {
          trigger: "axis",
          valueFormatter: (v: number | null) =>
            v == null ? "—" : money(v),
        },
        legend: {
          data: ["Projected (cumulative)", "Actual (cumulative)"],
          right: 0,
          top: 0,
          icon: "roundRect",
          textStyle: { color: "#6B6B70" },
        },
        xAxis: {
          type: "category",
          data: labels,
          axisLine: { lineStyle: { color: "#ECEBE7" } },
          axisLabel: { color: "#9A9AA0", rotate: labels.length > 8 ? 30 : 0 },
        },
        yAxis: {
          type: "value",
          axisLabel: {
            color: "#9A9AA0",
            formatter: (v: number) => `$${Math.round(v)}`,
          },
          splitLine: { lineStyle: { color: "#F1F0EC" } },
        },
        series: [
          {
            name: "Projected (cumulative)",
            type: "line",
            smooth: true,
            showSymbol: false,
            data: node.cumulativeProjected,
            lineStyle: { width: 2, color: "#B8B8BE", type: "dashed" },
            itemStyle: { color: "#B8B8BE" },
            markLine:
              currentMonthIdx >= 0
                ? {
                    silent: true,
                    symbol: "none",
                    lineStyle: { color: "#F26B3A", type: "dotted", width: 1 },
                    data: [{ xAxis: labels[currentMonthIdx] }],
                    label: { formatter: "Now", color: "#F26B3A" },
                  }
                : undefined,
          },
          {
            name: "Actual (cumulative)",
            type: "line",
            smooth: true,
            showSymbol: false,
            data: node.cumulativeActual,
            lineStyle: { width: 3, color: "#F26B3A" },
            itemStyle: { color: "#F26B3A" },
            areaStyle: { color: "rgba(242,107,58,0.10)" },
          },
        ],
      };
    }

    return {
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v: number) => money(v),
      },
      legend: {
        data: ["Projected", "Actual"],
        right: 0,
        top: 0,
        icon: "roundRect",
        textStyle: { color: "#6B6B70" },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: "#ECEBE7" } },
        axisLabel: { color: "#9A9AA0", rotate: labels.length > 8 ? 30 : 0 },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#9A9AA0",
          formatter: (v: number) => `$${Math.round(v)}`,
        },
        splitLine: { lineStyle: { color: "#F1F0EC" } },
      },
      series: [
        {
          name: "Projected",
          type: "bar",
          data: node.projected,
          itemStyle: { color: "#D4D4D8" },
          barGap: "10%",
        },
        {
          name: "Actual",
          type: "bar",
          data: node.actual.map((v, i) =>
            i > currentMonthIdx ? null : v,
          ),
          itemStyle: { color: "#F26B3A" },
        },
      ],
    };
  }, [mode, node, labels, currentMonthIdx]);

  return (
    <div>
      <div className="mb-2 inline-flex rounded-lg border border-hairline p-0.5">
        {(
          [
            ["cumulative", "Cumulative"],
            ["monthly", "Monthly"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v)}
            className={
              mode === v
                ? "rounded-md bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
                : "rounded-md px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-ink"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
    </div>
  );
}
