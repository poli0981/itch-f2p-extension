// ESLint flat config (ESLint 9+)
// Targets: MV3 Chrome extension (service worker, content script, UI pages, Node scripts).

import globals from "globals";

export default [
    // Global ignores
    {
        ignores: [
            "lib/**",
            "node_modules/**",
            "dist/**",
            "*.min.js",
            "*.min.mjs",
        ],
    },

    // Extension runtime code (ES modules, chrome globals)
    {
        files: ["shared/**/*.js", "background/**/*.js", "popup/**/*.js", "queue/**/*.js", "settings/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                chrome: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
            "no-undef": "error",
            "no-console": "off",
            "no-empty": ["warn", { allowEmptyCatch: true }],
            "prefer-const": "warn",
            "no-var": "error",
            eqeqeq: ["error", "smart"],
        },
    },

    // Content script (IIFE, no modules)
    {
        files: ["content/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                chrome: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", { args: "none" }],
            "no-undef": "error",
            "no-console": "off",
            "prefer-const": "warn",
            "no-var": "error",
        },
    },

    // Node.js build scripts
    {
        files: ["scripts/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
        rules: {
            "no-unused-vars": ["warn", { args: "none" }],
            "no-undef": "error",
            "no-console": "off",
            "prefer-const": "warn",
            "no-var": "error",
        },
    },
];
