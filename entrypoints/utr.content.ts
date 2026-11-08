export default defineContentScript({
  matches: ['*://app.utrsports.net/*'],
  main(ctx) {
    runProfilePage(ctx, {
      site: 'utr',
      profileIdFromLocation: (loc) => utrProfileIdFromPath(loc.pathname),
      playerName: { load: requestUtrPlayerName },
      // No findOnOtherSite: USTA refuses searches from outside its pages. The panel offers "Find on USTA" instead,
      // which opens USTA's search page, where the extension finishes the lookup (see usta.content.ts).
    });
  },
});
