import ReactECharts from "echarts-for-react";
import { money } from "@/lib/utils";

// Cumulative spending by day of month: current month vs previous month.
export function SpendingLineChart({
  days,
  thisMonth,
  lastMonth,
}: {
  days: number[];
  thisMonth: (number | null)[];
  lastMonth: (number | null)[];
}) {
  const option = {
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => money(v),
    },
    legend: {
      data: ["This month", "Last month"],
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
    series: [
      {
        name: "This month",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: thisMonth,
        lineStyle: { width: 3, color: "#F26B3A" },
        areaStyle: { color: "rgba(242,107,58,0.10)" },
      },
      {
        name: "Last month",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: lastMonth,
        lineStyle: { width: 2, color: "#B8B8BE", type: "dashed" },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 260 }} notMerge />;
}
