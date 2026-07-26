module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2020,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  ignorePatterns: ["lib/**"],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
    // google's 80-char limit and mandatory JSDoc don't match this file's actual style
    // (long log messages, long AI prompt strings); never enforced in practice before this.
    "max-len": "off",
    "require-jsdoc": "off",
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
    {
      // TypeScript source follows its own established style (single quotes, no
      // mandatory JSDoc) rather than the "google" preset above, written for index.js.
      files: ["**/*.ts"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      extends: [
        "plugin:@typescript-eslint/recommended",
      ],
      rules: {
        "quotes": ["error", "single", {"allowTemplateLiterals": true}],
        "max-len": "off",
        "indent": "off",
        "object-curly-spacing": ["error", "always"],
        "require-jsdoc": "off",
        "valid-jsdoc": "off",
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
  globals: {},
};
