import { defineConfig } from 'vitest/config';

// Pure business-logic tests only, for now - UI/component testing is a separate, later step.
// jsdom (not 'node') is required because these modules assign to `window` as a top-level,
// module-load side effect (e.g. window.generateCouponFromModal = ...), independent of which
// specific function a given test file is actually exercising.
export default defineConfig({
  test: {
    include: [
      'public/js/**/*.test.{js,ts}',
      'merchant/js/**/*.test.{js,ts}',
      'shared/**/*.test.{js,ts}',
    ],
    environment: 'jsdom',
  },
});
