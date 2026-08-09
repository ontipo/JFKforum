/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: "#08080a",
        surface: "#111114",
        raised: "#18181c",
        line: "#2a2a30",
        silver: {
          100: "#f2f2f5",
          300: "#c7c8cf",
          500: "#9a9ba6",
          700: "#5c5d68",
          900: "#232329"
        },
        accent: "#d6d8e0"
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"]
      },
      boxShadow: {
        silver: "0 0 0 1px rgba(214,216,224,0.06), 0 8px 30px -10px rgba(0,0,0,0.7)",
        "silver-hover": "0 0 0 1px rgba(214,216,224,0.16), 0 12px 40px -8px rgba(0,0,0,0.85), 0 0 24px -6px rgba(214,216,224,0.15)",
        glow: "0 0 24px -4px rgba(214,216,224,0.35)"
      },
      keyframes: {
        rise: {
          "0%": { opacity: 0, transform: "translateY(10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        }
      },
      animation: {
        rise: "rise 0.4s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.5s linear infinite"
      }
    }
  },
  plugins: []
};
