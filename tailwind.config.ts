import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        storm: {
          bg: "#0b0d18",
          panel: "#151a2d",
          accent: "#7aa2ff",
          danger: "#ff5d6c",
          gold: "#f6c94d"
        }
      },
      fontFamily: {
        display: ["'Cinzel'", "serif"],
        body: ["'Inter'", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
