import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";

// functions/ and frontend/ are separate packages with their own lint setup
// (functions/.eslintrc.js, frontend/eslint.config.js) - run `npm run lint` in each instead of
// linting them from here. This root config only covers stray root-level tooling files.
export default defineConfig([
  globalIgnores(["functions/**", "frontend/**"]),
  { files: ["*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
]);
