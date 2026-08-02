/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-elevated": "var(--bg-elevated)",
        surface: "var(--surface)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        border: "var(--border)",
        highlight: "var(--highlight)",
        ink: "var(--ink)",
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        body: ['"Figtree"', "system-ui", "sans-serif"],
        reader: ['"Source Serif 4"', "Georgia", "serif"],
      },
      borderRadius: {
        pill: "999px",
        panel: "1.25rem",
      },
      boxShadow: {
        panel: "var(--panel-shadow)",
      },
    },
  },
  plugins: [],
};
