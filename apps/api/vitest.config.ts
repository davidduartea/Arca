import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Vitest para un proyecto de Nest.
 *
 * Nest genera Jest por defecto, pero corremos Vitest en los dos apps para
 * tener un solo runner y un solo formato de coverage en el monorepo. El precio
 * es este plugin: Vitest usa esbuild, que borra los decoradores sin emitir la
 * metadata que la inyección de dependencias de Nest necesita en runtime. SWC
 * sí la emite, así que sustituimos el transform.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/main.ts", "src/**/*.module.ts"],
      // Umbrales que rompen el build. Empiezan bajos a propósito y suben
      // conforme crece la suite: un umbral inalcanzable se termina borrando.
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
