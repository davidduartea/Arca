/**
 * Tailwind entra por aquí.
 *
 * Es el único complemento de PostCSS que hay, y a propósito: `@tailwindcss/postcss`
 * ya trae dentro el prefijado de fabricante y la minificación, así que autoprefixer
 * y cssnano sobran — en la versión 4 añadirlos duplica trabajo y a veces pelea con
 * lo que Tailwind acaba de escribir.
 *
 * Turbopack busca este archivo desde la raíz del proyecto de Next, que es
 * `apps/web` y no la del repositorio. Por eso vive aquí y no arriba.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
