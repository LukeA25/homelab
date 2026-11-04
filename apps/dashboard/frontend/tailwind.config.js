/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#07080D",
        panel: "rgba(12, 14, 22, 0.5)",
        card: "rgba(16, 18, 30, 0.55)",
        hairline: "rgba(255, 255, 255, 0.09)",
        ink: {
          DEFAULT: "#EEF1F8",
          muted: "#9BA3B6",
          faint: "#727C93",
        },
        accent: {
          DEFAULT: "#4F8BFF",
          soft: "rgba(79, 139, 255, 0.16)",
        },
        violet: {
          DEFAULT: "#A27BFF",
          soft: "rgba(162, 123, 255, 0.16)",
        },
        lime: {
          DEFAULT: "#B7F34D",
          soft: "rgba(183, 243, 77, 0.14)",
        },
        cyan: {
          DEFAULT: "#34E0E8",
          soft: "rgba(52, 224, 232, 0.14)",
        },
        warm: {
          DEFAULT: "#FFB547",
          soft: "rgba(255, 181, 71, 0.18)",
        },
        gain: "#2FE39B",
        loss: "#FF6680",
      },
      borderRadius: {
        card: "18px",
      },
      boxShadow: {
        card: "0 0 0 1px rgba(255, 255, 255, 0.015), 0 14px 36px rgba(0, 0, 0, 0.5)",
        glow: "0 0 24px rgba(162, 123, 255, 0.28)",
      },
      fontFamily: {
        sans: [
          "Figtree",
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
          "Figtree",
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
