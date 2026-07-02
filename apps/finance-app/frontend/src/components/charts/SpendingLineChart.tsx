import ReactECharts from "echarts-for-react";
import { money } from "@/lib/utils";

// Cumulative spending by day of month for one month, optionally vs the prior month.
export function SpendingLineChart({
  days,
  thisMonth,
  lastMonth = null,
  thisMonthLabel = "This month",
  lastMonthLabel = "Last month",
}: {
  days: number[];
  thisMonth: (number | null)[];
  lastMonth?: (number | null)[] | null;
  thisMonthLabel?: string;
  lastMonthLabel?: string;
}) {
  const showCompare = lastMonth != null;

  const series: {
    name: string;
    type: "line";
    smooth: boolean;
    showSymbol: boolean;
    data: (number | null)[];
    lineStyle: { width: number; color: string; type?: "dashed" | "solid" };
    itemStyle: { color: string };
    areaStyle: { color: string };
  }[] = [
    {
      name: thisMonthLabel,
      type: "line" as const,
      smooth: true,
      showSymbol: false,
      data: thisMonth,
      lineStyle: { width: 3, color: "#F26B3A" },
      itemStyle: { color: "#F26B3A" },
      areaStyle: { color: "rgba(242,107,58,0.10)" },
    },
  ];

  if (showCompare) {
    series.push({
      name: lastMonthLabel,
      type: "line" as const,
      smooth: true,
      showSymbol: false,
      data: lastMonth,
      lineStyle: { width: 2, color: "#B8B8BE", type: "dashed" },
      itemStyle: { color: "#B8B8BE" },
      areaStyle: { color: "transparent" },
    });
  }

  const option = {
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => money(v),
    },
    legend: {
      data: showCompare ? [thisMonthLabel, lastMonthLabel] : [thisMonthLabel],
      right: 0,
      top: 0,
      icon: "roundRect",
      textStyle: { color: "#6B6B70" },
    },
    xAxis: {
      type: "category",
      data: days,
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#ECEBE7" } },
      axisLabel: { color: "#9A9AA0" },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#9A9AA0",
        formatter: (v: number) => `$${Math.round(v)}`,
      },
      splitLine: { lineStyle: { color: "#F1F0EC" } },
    },
    series,
  };

  return <ReactECharts option={option} style={{ height: 260 }} notMerge />;
}
