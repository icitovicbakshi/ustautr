export default defineContentScript({
  matches: ['*://*.usta.com/*'],
  main(ctx) {
    runProfilePage(ctx, {
      site: 'usta',
      profileIdFromLocation: ustaUaidFromLocation,
      playerName: { load: fetchUstaPlayerName, read: readNameFromProfilePage },
      findOnOtherSite: requestUtrSearch,
      diagnose: describeProfilePage,
    });
    // A USTA search page opened by "Find on USTA" from a UTR profile: search from here and offer the player.
    runHandoffPage(ctx, { from: 'utr', handoffFromLocation: ustaHandoffFromLocation, find: searchUstaPlayers });
  },
});

/**
 * Where USTA renders the name: <h3>{data[0].name}</h3> inside its read-only "Full name" field, which sits in a
 * server-rendered <div class="aem-form-text"> wrapper. (The field's own id doesn't survive Vue rendering.)
 */
const NAME_FIELD_SELECTOR = '.aem-form-text h3';

/** Page chrome whose headings are never the player's name (e.g. the "PLAYER RESOURCES" menu title). */
const CHROME_SELECTOR = 'nav, header, footer, [role="navigation"], .secondarynavigation, ustautr-panel';

/**
 * Fallback when the player-info call fails: the "Full name" field only. Guessing from other headings is
 * deliberately not done — a wrong name ("Player Overview", "PLAYER RESOURCES") leads to wrong suggestions,
 * which is worse than asking the user.
 */
function readNameFromProfilePage(): string | null {
  for (const field of pageHeadings(NAME_FIELD_SELECTOR)) {
    const text = textOf(field);
    if (text && looksLikeName(text)) return text;
  }
  return null;
}

/** What the page looked like when the name couldn't be found: counts and short heading texts. */
function describeProfilePage(): unknown {
  const headings = (selector: string) =>
    pageHeadings(selector)
      .slice(0, 6)
      .map((h) => textOf(h)?.slice(0, 40) ?? '');
  return {
    nameFieldHeadings: headings(NAME_FIELD_SELECTOR),
    formTextWrappers: document.querySelectorAll('.aem-form-text').length,
    vueFormTextTags: document.querySelectorAll('v-form-text').length,
    unrenderedTemplate: document.body.innerHTML.includes('{data[0].name}'),
    h1: headings('h1'),
    h2: headings('h2'),
    h3: headings('h3'),
  };
}

/** Headings on the page outside navigation, menus and the extension's own panel. */
function pageHeadings(selector: string): Element[] {
  return [...document.querySelectorAll(selector)].filter((h) => !h.closest(CHROME_SELECTOR));
}

function textOf(node: Element | null): string | null {
  return node?.textContent?.replace(/\s+/g, ' ').trim() || null;
}

/**
 * Two to five words of letters (with hyphens, apostrophes, periods). Rejects unrendered "{…}" templates and
 * ALL-CAPS text, which on these pages is a label ("PLAYER RESOURCES"), not a name.
 */
function looksLikeName(text: string): boolean {
  const words = text.split(' ');
  if (words.length < 2 || words.length > 5) return false;
  if (!/^[\p{L}][\p{L}'’.\- ]+$/u.test(text)) return false;
  return text !== text.toUpperCase();
}
