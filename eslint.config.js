import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // A <button> padded p-1.5 or less is a tap target of 28px or under, well
      // below the 44px guideline. Grow the padding where the layout has room;
      // in a dense row add a matching negative margin (-m-3.5 p-3.5) so the hit
      // area grows without stretching the row. Deliberate exceptions carry an
      // eslint-disable-next-line with the reason.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'JSXOpeningElement[name.name="button"] JSXAttribute[name.name="className"] Literal[value=/(^|\\s)p-(0\\.5|1|1\\.5)(\\s|$)/]',
          message:
            "Icon button under a 44px tap target. Grow the padding, or use -m-3.5 p-3.5 in a dense row to keep the layout.",
        },
        {
          selector:
            'JSXOpeningElement[name.name="button"] JSXAttribute[name.name="className"] TemplateElement[value.raw=/(^|\\s)p-(0\\.5|1|1\\.5)(\\s|$)/]',
          message:
            "Icon button under a 44px tap target. Grow the padding, or use -m-3.5 p-3.5 in a dense row to keep the layout.",
        },
      ],
    },
  },
);
