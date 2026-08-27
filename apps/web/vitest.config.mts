import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),

      // `server-only` lanza al importarse: es su forma de romper el build si un
      // modulo de servidor acaba en el paquete del navegador. Vitest no
      // distingue los entornos de Next, asi que aqui se sustituye por un modulo
      // vacio. La garantia sigue viva en `next build`, que si distingue.
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],

    // La direccion de la API se lee al cargar el modulo y sin ella no levanta.
    // Los tests que comprueban justamente esa ausencia la quitan por su cuenta.
    env: { API_URL: "http://libro.test" },

    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.ts", "src/models/**/*.ts"],

      /**
       * Que queda fuera de la medida, y por que.
       *
       * Los archivos que solo declaran tipos ni siquiera aparecen: no producen
       * codigo y v8 no los ve. Estos otros exportan una constante y nada mas, y
       * un porcentaje sobre una constante no dice nada — solo empuja a escribir
       * tests que la importan para subir un numero.
       *
       * Lo que si entra: las utilidades de `lib` y **todos los esquemas**, que
       * son la puerta que valida lo que llega desde el navegador.
       */
      exclude: [
        "src/**/*.spec.*",
        "src/test/**",
        "src/models/auth/FormState.ts",
        "src/models/auth/PasswordPolicy.ts",
        "src/models/enums/AccountKind.ts",
        "src/models/transfers/MoveState.ts",
      ],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
