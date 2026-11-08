import { defineConfig } from 'wxt';

// Chrome and Edge share the same MV3 build; Edge loads the Chrome output as-is.
// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  // One icon source (assets/icon.svg) for every size: extensions page, toolbar, and the panel's own mark.
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
    sizes: [128, 96, 48, 32, 16],
    developmentIndicator: 'overlay',
  },
  manifest: {
    name: 'USTA ⇄ UTR',
    description: 'Jump between a player\'s USTA and UTR profiles.',
    permissions: ['storage'],
    // UTR's player search and profile API, called without cookies, to find USTA players on UTR.
    // (USTA is searched from content scripts on USTA's own pages, which needs no extra permission.)
    host_permissions: ['https://api.utrsports.net/*'],
    // A toolbar entry, so the icon can be pinned next to the address bar.
    action: { default_title: 'USTA ⇄ UTR' },
  },
});
