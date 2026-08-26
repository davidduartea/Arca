import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.generated.*"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Un `any` es un agujero en el sistema de tipos, y en un libro contable
      // los agujeros cuestan dinero. `unknown` con narrowing hace el mismo
      // trabajo y obliga a comprobar.
      "@typescript-eslint/no-explicit-any": "error",

      // Una promesa sin await ni catch se pierde en silencio: la transacción
      // parece completada y no lo está.
      "@typescript-eslint/no-floating-promises": "error",

      // Marcar el descarte con guion bajo, para que un parámetro sin usar sea
      // una decisión visible y no un olvido.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // Los tests montan dobles y fuerzan casos imposibles a propósito.
    files: ["**/*.spec.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  {
    // Los archivos de configuración quedan fuera del tsconfig de cada paquete
    // — ese sólo incluye `src/` — así que el servicio de proyecto no los ve y
    // las reglas con tipos no pueden analizarlos. Se comprueban sin tipos.
    files: ["**/*.config.ts", "**/*.config.mts", "**/*.config.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },

  // Va el último: apaga las reglas de estilo que pisarían a Prettier.
  prettier,
);
