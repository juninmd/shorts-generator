import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "output/**", "web/**", "node_modules/**", ".claude/**", "worldcup-tracker/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  {
    // Test doubles deliberately bypass types (tests are outside tsconfig). Pre-existing debt: 663 sites, tracked in docs/CLAUDE_RELATORIO_IMPLEMENTACAO.md.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { require: "readonly", process: "readonly", module: "writable", __dirname: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
