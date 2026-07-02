import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { money } from "@/lib/utils";

export interface NestedDonutCategory {
  name: string;
  value: number;
  color: string;
}

export interface NestedDonutSubcategory {
  key: string;
  categoryName: string;
  subName: string;
  value: number;
  color: string;
}

export type DonutSelection = { category: string; sub?: string } | null;

function colorSwatch(hex: string): string {
  return `<span style="display:inline-block;width:10px;height:10px;background:${hex};border-radius:2px;margin-right:6px;vertical-align:middle"></span>`;
}

export function NestedCategoryDonut({
  categories,
  subcategories,
  height = 280,
  selection = null,
  onSelect,
}: {
  categories: NestedDonutCategory[];
  subcategories: NestedDonutSubcategory[];
  height?: number;
  selection?: DonutSelection;
  onSelect?: (next: DonutSelection) => void;
}) {
  const total = categories.reduce((sum, c) => sum + c.value, 0);
  const catByName = new Map(categories.map((c) => [c.name, c]));

  const dimSub = (cat: string, sub: string) => {
    if (!selection) return 1;
    if (selection.sub) {
      return selection.category === cat && selection.sub === sub ? 1 : 0.2;
    }
    return selection.category === cat ? 1 : 0.2;
  };

  const option: EChartsOption = {
    tooltip: {
      trigger: "item",
      borderWidth: 0,
      padding: [10, 12],
      extraCssText: "box-shadow: 0 8px 24px rgba(16, 24, 40, 0.12);",
      formatter: (params) => {
        const p = params as { name?: string; value?: number };
        const sub = subcategories.find((s) => s.key === p.name);
        if (!sub) return "";
        const cat = catByName.get(sub.categoryName);
        const catColor = cat?.color ?? sub.color;
        const catTotal = cat?.value ?? 0;
        return [
          `${colorSwatch(catColor)}<span style="font-weight:600">${sub.categoryName}</span>`,
          `<span style="color:#6B6B70">${sub.subName}</span>`,
          `<span style="font-weight:600">${money(p.value ?? 0)}</span>`,
          `<span style="color:#9A9AA0;font-size:12px">Category total ${money(catTotal)}</span>`,
        ].join("<br/>");
      },
    },
    series: [
      {
        name: "Subcategories",
        type: "pie",
        radius: ["58%", "82%"],
        center: ["50%", "50%"],
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
        data: subcategories.map((s) => ({
          name: s.key,
          value: s.value,
          itemStyle: {
            color: s.color,
            opacity: dimSub(s.categoryName, s.subName),
          },
        })),
      },
    ],
  };

  const onEvents = onSelect
    ? {
        click: (params: { name?: string }) => {
          const sub = subcategories.find((s) => s.key === params.name);
          if (!sub) return;
          if (
            selection?.category === sub.categoryName &&
            selection.sub === sub.subName
          ) {
            onSelect(null);
          } else {
            onSelect({ category: sub.categoryName, sub: sub.subName });
          }
        },
      }
    : undefined;

  return (
    <ReactECharts
      option={option}
      style={{ height }}
      notMerge
      onEvents={onEvents}
    />
  );
}
