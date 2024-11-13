
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser for TypeScript
  parserOptions: {
    ecmaVersion: 2020, // Allows parsing of modern ECMAScript features
    sourceType: 'module',   // Allows usage of imports
    project: './tsconfig.json', // Required for certain TypeScript rules (optional)
  },
  env: {
    node: true,     // Enable Node.js global variables
    jest: true,     // Add Jest testing global variables
    es6: true,      // Enable ES6 features
  },
  plugins: [
    '@typescript-eslint', // Plugin for TypeScript rules
    'jest',               // Plugin for Jest testing
    // 'prettier',           // Plugin to integrate Prettier with ESLint
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
};
