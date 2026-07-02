/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monarch-style warm light palette
        canvas: "#FBFAF8",
        card: "#FFFFFF",
        hairline: "#ECEBE7",
        ink: {
          DEFAULT: "#1C1C1E",
          muted: "#6B6B70",
          faint: "#9A9AA0",
        },
        accent: {
          DEFAULT: "#F26B3A",
          soft: "#FDEBE2",
        },
        gain: "#1E9E6A",
        loss: "#D64545",
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
        pop: "0 8px 24px rgba(16, 24, 40, 0.12)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
