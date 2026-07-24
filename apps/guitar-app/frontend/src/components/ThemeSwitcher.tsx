import type { ThemeId } from "../lib/types";

const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: "purple", label: "Neon", swatch: "#b8ff4a" },
  { id: "teal", label: "Teal", swatch: "#2dd4bf" },
  { id: "amber", label: "Amber", swatch: "#f5a524" },
];

type ThemeSwitcherProps = {
  theme: ThemeId;
  onChange: (theme: ThemeId) => void;
};

export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-2 rounded-pill px-3 py-2 text-sm transition ${
              active
                ? "btn-accent shadow-glow-sm"
                : "border border-border bg-surface text-muted hover:text-text"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: t.swatch, boxShadow: active ? `0 0 8px ${t.swatch}` : undefined }}
            />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
