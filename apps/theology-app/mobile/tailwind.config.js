/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        "bg-elevated": "#12161c",
        surface: "#181e27",
        text: "#e8edf4",
        muted: "#8b97a8",
        accent: "#7eb8a2",
        "accent-soft": "rgba(126, 184, 162, 0.16)",
        border: "rgba(232, 237, 244, 0.08)",
        highlight: "rgba(212, 168, 75, 0.35)",
      },
      fontFamily: {
        sans: ["Figtree_400Regular"],
        "sans-medium": ["Figtree_500Medium"],
        "sans-semibold": ["Figtree_600SemiBold"],
        display: ["Fraunces_600SemiBold"],
        serif: ["SourceSerif4_400Regular"],
        "serif-medium": ["SourceSerif4_500Medium"],
      },
    },
  },
  plugins: [],
};
