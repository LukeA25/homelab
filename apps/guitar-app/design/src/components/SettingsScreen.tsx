import type { ThemeId } from "../lib/types";
import { Page, PageHeader } from "./Page";
import { ThemeSwitcher } from "./ThemeSwitcher";

type SettingsScreenProps = {
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
};

export function SettingsScreen({ theme, onThemeChange }: SettingsScreenProps) {
  return (
    <Page>
      <PageHeader
        eyebrow="Prototype"
        title="Themes"
        description="Colors are CSS variables — flip schemes without rebuilding screens."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel rounded-panel p-5 md:p-6">
          <h2 className="text-lg font-semibold">Color scheme</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Default is Neon (dark violet + lime), inspired by that music UI. Teal and Amber are
            alternatives.
          </p>
          <ThemeSwitcher theme={theme} onChange={onThemeChange} />
        </section>

        <section className="panel rounded-panel p-5 md:p-6">
          <h2 className="text-lg font-semibold">What this is</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Responsive web design prototype (no backend)</li>
            <li>Mock library for layout only</li>
            <li>Working transpose on song sheets</li>
            <li>Optional art tiles vs letter fallbacks</li>
          </ul>
        </section>
      </div>
    </Page>
  );
}
