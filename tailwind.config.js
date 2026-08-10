/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "var(--bg)",
          surface: "var(--surface)",
          raised: "var(--raised)",
          line: "var(--line)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          sub: "var(--ink-sub)",
        },
        accent: {
          yellow: "var(--accent-yellow)",
          red: "var(--accent-red)",
        },
        pill: {
          1: "var(--pill-1)",
          2: "var(--pill-2)",
          3: "var(--pill-3)",
          4: "var(--pill-4)",
          5: "var(--pill-5)",
          6: "var(--pill-6)",
          7: "var(--pill-7)",
          8: "var(--pill-8)",
        },
      },
    },
  },
  plugins: [],
};
