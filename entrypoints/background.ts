export default defineBackground(() => {
  // Earlier versions remembered which player the user opened, which could save a wrong pairing.
  // Remembering is off until matches can be verified, so clear anything saved before.
  browser.runtime.onInstalled.addListener(() => void storage.removeItem('local:knownMatches'));

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isLookupRequest(message)) return;
    lookup(message)
      .then((value) => sendResponse({ ok: true, value }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error), status: error instanceof HttpError ? error.status : undefined }),
      );
    return true; // keeps the message channel open for the async reply
  });
});

function lookup(request: LookupRequest): Promise<unknown> {
  switch (request.type) {
    case 'utr-search':
      return searchUtrPlayers(request.query);
    case 'utr-player-name':
      return fetchUtrPlayerName(request.id);
  }
}
