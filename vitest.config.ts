import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      "test_data_role2/dataset-integration.test.ts",
    ],
  },
});
