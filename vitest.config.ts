import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// WxtVitest provides WXT's auto-imports and an in-memory fake of the browser extension APIs.
export default defineConfig({
  plugins: [WxtVitest()],
});
