import type { Config } from "tailwindcss";

/**
 * WONDERvoice — dark, professional "pro-tool / editor" palette.
 * Semantic tokens are the source of truth; the legacy `slate`/`brand`/`emerald`/
 * `red` ramps are remapped to the same dark values so existing utility classes
 * (e.g. text-slate-900, bg-brand-600) render correctly in the dark theme.
 * `white` is intentionally left as real white — it's used for button text.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0b0d12",
        panel: "#141821",
        elev: "#1b212d",
        hair: { DEFAULT: "#232a37", bright: "#313a4b" },
        ink: "#e7ecf3",
        dim: "#97a3b6",
        muted: "#6b7689",
        accent: { DEFAULT: "#6ea8fe", strong: "#4f8cff" },
        success: "#3ddc97",
        danger: "#ff6b6b",

        // Remapped legacy ramps (dark theme). Low numbers = surfaces,
        // high numbers = light text (inverted from the light theme).
        slate: {
          50: "#1b212d",
          100: "#1f2733",
          200: "#232a37",
          300: "#2b3442",
          400: "#6b7689",
          500: "#97a3b6",
          600: "#9aa6b8",
          700: "#c2ccd9",
          800: "#dbe2ec",
          900: "#e7ecf3",
        },
        brand: {
          50: "#172033",
          100: "#1d2b45",
          500: "#6ea8fe",
          600: "#4f8cff",
          700: "#3f7ef0",
        },
        emerald: {
          50: "#10261f",
          100: "#143a2c",
          700: "#3ddc97",
        },
        red: {
          50: "#2a1414",
          100: "#3a1d1d",
          600: "#ff6b6b",
          700: "#ff8a8a",
        },
      },
      boxShadow: {
        soft: "0 10px 40px rgba(0,0,0,0.45)",
      },
      backgroundImage: {
        "primary-grad": "linear-gradient(135deg, #4f8cff, #6f6bff)",
        "logo-grad": "linear-gradient(135deg, #4f8cff, #9b6bff)",
      },
    },
  },
  plugins: [],
};

export default config;
