/**
 * Tailwind v4 is applied as a PostCSS plugin (CSS-first config lives in
 * `app/globals.css` via `@import "tailwindcss"` + `@theme`).
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
