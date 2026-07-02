import ReactECharts from "echarts-for-react";
import { money } from "@/lib/utils";

export interface DonutItem {
  name: string;
  value: number;
  color: string;
}

export function CategoryDonut({ items }: { items: DonutItem[] }) {
  const total = items.reduce((sum, i) => sum + i.value, 0);

  const option = {
    tooltip: {
      trigger: "item",
      valueFormatter: (v: number) => money(v),
    },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 0,
      top: "center",
      textStyle: { color: "#6B6B70" },
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "82%"],
        center: ["34%", "50%"],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: "#FFFFFF", borderWidth: 2 },
        label: {
          show: true,
          position: "center",
          formatter: () => `${money(total)}\nTotal`,
          color: "#1C1C1E",
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 18,
        },
        labelLine: { show: false },
        data: items.map((i) => ({
          name: i.name,
          value: i.value,
          itemStyle: { color: i.color },
        })),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 260 }} notMerge />;
}
