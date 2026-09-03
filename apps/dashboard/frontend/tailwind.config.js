/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0E1116",
        panel: "#151A22",
        card: "#1B2230",
        hairline: "#2A3344",
        ink: {
          DEFAULT: "#E8EDF5",
          muted: "#9AA6B8",
          faint: "#6B778A",
        },
        accent: {
          DEFAULT: "#5B8CFF",
          soft: "rgba(91, 140, 255, 0.16)",
        },
        warm: {
          DEFAULT: "#F0B429",
          soft: "rgba(240, 180, 41, 0.18)",
        },
        gain: "#3DDC97",
        loss: "#F07178",
      },
      borderRadius: {
        card: "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.22)",
      },
      fontFamily: {
        sans: [
          "Sora",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: [
          "Outfit",
          "Sora",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      screens: {
        // iPad Mini landscape ~1024px; treat as primary dashboard breakpoint
        dash: "1024px",
      },
    },
  },
  plugins: [],
};
