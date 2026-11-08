# USTA ⇄ UTR: design notes

A browser extension that makes it quick to jump between a player's USTA and UTR profiles. Its purpose is convenience links. Showing extra information is limited to what helps pick the right match.

## Goals

- From a player shown on either site, get to the same player on the other site in one click.
- Be useful logged out. Do more when the user is signed in to the site being searched.
- Keep working as both sites change, with breakage limited to small, isolated fixes.
- Stay on the right side of both sites' terms: on-demand, user-initiated, no bulk collection, never handle credentials.

## Key facts

- **No shared ID.** USTA and UTR identify players independently, so every cross-link is a matching problem.
- **UTR lives at `app.utrsports.net`.** `utr.com` is not UTR; it redirects to an unrelated domain.
- **UTR profiles:** `app.utrsports.net/profiles/{id}`. A direct link opens logged out with a minimal view and a sign-in prompt. Search works logged out.
- **USTA profiles:** `www.usta.com/en/home/play/player-search/profile.html#uaid={id}&tab=…`. The player id is in the URL fragment, so in-page navigation changes it without a page load. A direct link opens logged out. Player search appears to require sign-in.

## Site APIs (observed in the browser)

**UTR** (`api.utrsports.net`; CORS allows only `https://app.utrsports.net`, which an extension with host permission is not bound by):
- Search: `GET /v2/search?schoolClubSearch=true&query={name}&top=10&skip=0`. The site calls it on every keystroke.
- Profile: `GET /v1/player/{id}/profile`, where `{id}` is the id in the profile page URL (not the separate `profileId` field).
- Signed in, the site sends `Authorization: Bearer {token}`. **Both endpoints also work signed out** with no token: names, gender, `ageRange` and location come back; birth date and age are null and subscribers' ratings are masked (`4.xx`). The extension calls them signed out, without cookies, from the background worker. It never reads the user's token.
- Search relevance scores separate a true match clearly (roughly 3x the next result in the one sample seen).
- `thirdPartyRankings` on search results lists ATP ranks with no outside id, so it doesn't provide a USTA cross-reference.
- Matching fields on the profile: `playerFirstName`, `playerLastName` (trimmed; `lastName` and `displayName` may have trailing spaces), `gender`, `age`, `birthDate` / `hasYobOnly`, `ageRange`, `location.cityName` / `stateAbbr` / `countryCode3`.- A subscriber account sees much more (rating history, full birth date). Matching must work with what a free or signed-out user gets.

**USTA:**
- Search: `POST https://services.usta.com/v1/dataexchange/profile/search/public` with body `{"pagination":{"pageSize":"10","currentPage":"1"},"selection":{"name":{"fname":…,"lname":…}}}`. CORS allows only `https://www.usta.com`.
- Results: `name`, `uaid` (the profile id), `city`, `state` (abbreviation), `section` and `district`. No gender or age, so location is the tie-breaker.
- The search page takes the name in the URL: `player-search.html#page=1&searchText={name}`.
- **Search refuses calls from the extension's background worker (403)**, with or without the user's cookies (likely Akamai bot protection). That is respected, not worked around with faked headers. Instead the search runs from content scripts on USTA's own pages, where requests come from USTA's site (see the UTR → USTA hand-off above).
- Profile name: the page calls `POST https://www.usta.com/usta/api?type=playerInfo` (marked public) with `{"selection":{"uaid":…}}` and renders `data[0].name` in an `<h3>` inside its read-only "Full name" field. The extension makes the same call from the USTA page (same-origin), and falls back to reading that `<h3>`. Found by reading the page's public markup, which declares each component's API endpoint.

**Data handling rule:** personal details (birth date, age, location) are used only in memory to choose a match and are never stored, locally or in the future database. What is stored: the two player ids and display names.

## How login fits in

The extension never logs in, stores credentials, or reads the user's tokens. UTR's search and profile APIs work signed out, so finding a USTA player on UTR needs no login at all. USTA's search is called without cookies too; whether it needs sign-in is still unconfirmed. Profile links work signed out on both sites; the destination site may ask the user to sign in to see more. USTA's side is not yet known.

## Approach

**The goal: wherever a player is shown on one site, one click takes the user to the same person on the other site.** The extension works out who the player is and finds them on the other site automatically. The user never has to link or confirm anything.

**Searching is the user's call.** On a profile page the panel reads the player's name, then offers **Find on UTR** / **Find on USTA**; nothing is searched until the user clicks. (The lookup controller has a `searchOnLoad` switch, off by default, for a future preference. The USTA hand-off tab does search on load, because the user's click opened it.)

After the user clicks, the panel:
- Shows progress ("Finding Jane Doe on UTR…"), then the person found, with a few details (location, age group, gender) and **Open on UTR**.
- If several people could be the player, lists them; each opens that profile in one click.
- Shows the other site's rating on the card and in the list (e.g. **UTR 14.74**), exactly as that site shows it to signed-out visitors (some subscribers appear masked, like `4.xx`). UTR blanks some rated players' ratings entirely for signed-out visitors (shown as `0.xx`; often younger juniors, and search results carry an `isAgeKnownAndBelow14` flag). Those get a muted **UTR hidden** badge with an explanation, and unrated players a muted **Unrated** badge; the extension never tries to get around UTR's privacy rules. Only inside the panel, to help pick; nothing is added to the host page.
- Names and details wrap rather than being cut off; each row's tooltip also carries the full name, details and rating.
- Offers **Not the right player?** to see the other results, and a name field with **Find** to search a different name. The panel is the search: when the user searches themselves, every result is listed; automatic searches on page load stay strict (exact names only).
- Links to the other site's own search page only where that page shows results on arrival (USTA's does, via `#searchText=`). UTR's search page fills the box but shows nothing until the user interacts, so it is not linked.

**Nothing is saved.** Every visit searches fresh, and opening a profile is just a link. Clicking a result is never treated as confirmation that two profiles are the same person: users click results to look, and a saved wrong pairing would mislead every later visit.

**Linking (later, only when very sure).** A saved pairing between a USTA and a UTR profile may come back only when it can be verified, not inferred from a click:
- The full names match exactly (after normalizing case, accents and punctuation).
- The other details that both sites expose agree: location (city/state), gender, and age group, with no conflicts.
- There is exactly one such candidate on the other site.
Anything less stays a suggestion the user can open, never a stored link.

Order of work:
1. **USTA profile → UTR** (built): UTR search, signed out.
2. **UTR profile → USTA** (built, two clicks): USTA refuses its search API from the extension's background worker (403, even with the user's cookies; likely bot protection). So the UTR panel offers **Find on USTA ↗**, which opens USTA's own search page with the name and a marker (`#page=1&searchText={name}&ustautr=1`). On that page the extension runs the search from within USTA's site, as the page's own requests do, and shows the panel there; **Open on USTA** opens the profile in that same tab. The marker keeps the extension from acting on the user's own USTA searches, and the hand-off tab handles only the name it was opened for: if the user then searches another name in USTA's box, the panel steps away. The panel says whose lookup it is ("Finding … from UTR"), since it lists USTA profiles on a USTA page.
3. **Pages with many players** (tournament rosters, draws, entrant lists): a small icon next to each name, one click to that person on the other site. Searches run when an icon is clicked, not for every name on the page, to keep request volume at human pace.

Showing ratings or rankings from one site on the other site's pages (for example, UTR ratings in a USTA draw) is deliberately out of scope for now. It republishes paid data, so it needs its own decision.

## Icon

One source, `assets/icon.svg`: a hard-court-blue tile with faint court lines, two arrows out and back, and an optic-yellow ball at the start (the ball crosses the court and returns). WXT's auto-icons module renders every PNG size at build; the panel's header mark and collapsed chip inline the same SVG. Generic by design: no USTA or UTR logos or colors.

## Architecture

- Manifest V3, TypeScript, built with WXT.
- **One adapter per site** (`entrypoints/*.content.ts`): which page is a profile, how to get the player's name, and how to search the other site. Everything else is shared (`utils/profile-page.ts`). Single-page apps, so it reacts to in-page navigation, including URL fragment changes.
- **Site URL knowledge in one module** (`utils/sites.ts`).
- **Cross-site calls run in the background worker** (`entrypoints/background.ts`), which holds the host permission; content scripts ask it by message.
- **Matching** (`utils/matching.ts`): exactly one result with the same full name is offered directly; otherwise close names are listed. Location, gender and age group can tighten this once both sites expose them.
- Diagnostics (`utils/diagnostics.ts`): a short in-memory log of each step (statuses, response field names, counts; no personal data), also printed to the console with a `[ustautr]` prefix. The panel's **Copy diagnostics** button copies it when the player can't be found.
- Nothing is stored locally. (Earlier test builds saved pairings; the background worker clears that key on install/update.)
- Narrow permissions: `storage`, plus host access to `api.utrsports.net`. USTA needs none: it is only called from content scripts on USTA's pages.
- **Shared core** (`utils/lookup-controller.ts`): given a name, searches the other site and drives the panel. Profile pages (`utils/profile-page.ts`) and the USTA hand-off page (`utils/handoff-page.ts`) only decide when there's a player and what their name is.

## Data and accounts (planned, not built)

- More than links will be stored over time, so the extension will move to a hosted database with its own user accounts: sign in with Google, Apple, and similar.
- Leading candidate: Supabase (Postgres, built-in social login, per-user access rules, free tier). Sign-in from the extension via the browser's web auth flow, which works in Chrome and Edge.
- Data stays private to each user. Many players are minors, so there is no public or shared directory of player links.
- Any stored pairing must meet the linking rule above. Keep one module as the only place that reads or writes pairings, so the storage backend can change in one place.

## Platforms

- **Now:** desktop Chrome and Edge. Edge loads the Chrome build unchanged.
- **Kept open, not a constraint:** Firefox (desktop and Android) and Safari (Mac and iPhone) from the same WXT codebase. A share-sheet shortcut for the native apps. Keep core logic browser-agnostic where it costs nothing.

## Open questions

- USTA search: does it match hyphenated or partial last names, and does it work signed out?
- Whether each site's API accepts requests from the extension (origin checks, USTA's Akamai bot protection). To be seen in the first real run.
- Page structure of rosters, draws and entrant lists on both sites, for multi-player pages.
