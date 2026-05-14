import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      ".claude/**",
      "test_data_role2/dataset-integration.test.ts",
    ],
    testTimeout: 10000,
  },
});
