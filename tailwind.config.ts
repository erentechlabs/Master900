import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

/**
 * Design system: Windows 11 / WinUI 3 (Fluent) on the web. Colours come from CSS variables in globals.css
 * (Mica base, layer, card, control and stroke tokens for light and dark), controls use a 4px corner radius and
 * overlays (cards, flyouts, dialogs) 8px, type uses Segoe UI Variable optical sizes.
 */
const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        /** Content layer on top of the Mica base (NavigationView content area). */
        layer: "hsl(var(--layer))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /** Translucent fills for subtle (transparent) controls: nav items, menu items, ghost buttons. */
        subtle: {
          hover: "var(--subtle-hover)",
          pressed: "var(--subtle-pressed)",
        },
        /** Standard controls (buttons, text boxes, combo boxes). */
        control: {
          DEFAULT: "var(--control)",
          hover: "var(--control-hover)",
          pressed: "var(--control-pressed)",
          focus: "var(--control-focus)",
          stroke: "var(--control-stroke)",
          "stroke-bottom": "var(--control-stroke-bottom)",
          "stroke-strong": "var(--control-stroke-strong)",
        },
        stroke: {
          card: "var(--card-stroke)",
          divider: "var(--divider)",
          surface: "var(--surface-stroke)",
        },
        /** InfoBar / badge backgrounds. */
        tint: {
          info: "hsl(var(--tint-info))",
          success: "hsl(var(--tint-success))",
          warning: "hsl(var(--tint-warning))",
          danger: "hsl(var(--tint-danger))",
          brand: "hsl(var(--tint-brand))",
        },
        brand: {
          blue: "hsl(var(--brand-blue))",
          purple: "hsl(var(--brand-purple))",
          teal: "hsl(var(--brand-teal))",
          green: "hsl(var(--brand-green))",
        },
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
        /** Controls: buttons, text boxes, list items. */
        md: "4px",
        /** Overlays: cards, flyouts, dialogs. */
        lg: "8px",
        xl: "8px",
        "2xl": "12px",
      },
      boxShadow: {
        sm: "var(--shadow-2)",
        DEFAULT: "var(--shadow-4)",
        md: "var(--shadow-8)",
        lg: "var(--shadow-16)",
        xl: "var(--shadow-28)",
        "2xl": "var(--shadow-64)",
      },
      letterSpacing: {
        /** Segoe UI Variable is optically spaced: no negative tracking on headings. */
        tighter: "-0.01em",
        tight: "0",
      },
      fontFamily: {
        sans: ["Segoe UI Variable Text", "Segoe UI", "system-ui", "-apple-system", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["Segoe UI Variable Display", "Segoe UI", "system-ui", "-apple-system", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        small: ["Segoe UI Variable Small", "Segoe UI", "system-ui", "-apple-system", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["Cascadia Code", "Cascadia Mono", "Consolas", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        /** WinUI type ramp. */
        caption: ["12px", { lineHeight: "16px" }],
        body: ["14px", { lineHeight: "20px" }],
        "body-lg": ["18px", { lineHeight: "24px" }],
        subtitle: ["20px", { lineHeight: "28px", fontWeight: "600" }],
        title: ["28px", { lineHeight: "36px", fontWeight: "600" }],
        "title-lg": ["40px", { lineHeight: "52px", fontWeight: "600" }],
        display: ["68px", { lineHeight: "92px", fontWeight: "600" }],
      },
      maxWidth: {
        prose: "72ch",
      },
      transitionTimingFunction: {
        fluent: "cubic-bezier(0, 0, 0, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s cubic-bezier(0, 0, 0, 1)",
        "accordion-up": "accordion-up 0.2s cubic-bezier(0, 0, 0, 1)",
      },
    },
  },
  plugins: [animate, typography],
} satisfies Config;

export default config;
