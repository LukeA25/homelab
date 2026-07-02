import ReactECharts from "echarts-for-react";
import { money } from "@/lib/utils";

export interface StackSeries {
  name: string;
  color: string;
  data: number[];
}

// Spending composition per month: one stacked bar per month, segments by
// category.
export function StackedBarChart({
  labels,
  series,
  height = 360,
}: {
  labels: string[];
  series: StackSeries[];
  height?: number;
}) {
  const option = {
    grid: { left: 8, right: 16, top: 16, bottom: 48, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (v: number) => money(v),
    },
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: "#6B6B70" },
      icon: "roundRect",
    },
    xAxis: {
      type: "category",
      data: labels,
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
    series: series.map((s) => ({
      name: s.name,
      type: "bar",
      stack: "total",
      data: s.data,
      itemStyle: { color: s.color },
      emphasis: { focus: "series" },
    })),
  };

  return <ReactECharts option={option} style={{ height }} notMerge />;
}
