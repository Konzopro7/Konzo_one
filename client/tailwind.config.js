/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
        heading: ["Sora", "sans-serif"]
      },
      colors: {
        brand: {
          50: "#edf5fa",
          100: "#d5e8f4",
          500: "#0B3C5D",
          600: "#092f4b",
          700: "#08253b",
          900: "#041522"
        },
        aqua: {
          500: "#2EC4B6",
          600: "#23a79c"
        }
      },
      boxShadow: {
        soft: "0 10px 30px rgba(11, 60, 93, 0.08)",
        panel: "0 18px 45px rgba(11, 60, 93, 0.11)"
      },
      backgroundImage: {
        "dashboard-grid":
          "radial-gradient(circle at 1px 1px, rgba(11, 60, 93, 0.09) 1px, transparent 0)"
      }
    }
  },
  plugins: []
};
