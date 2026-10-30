# THE REST IS HISTORY — ORGANIZED

An independent companion to **The Rest Is History**, arranged by the history being discussed rather than the date an episode was released.

**Live:** https://history.jakub.computer

The initial catalogue contains all **736 episodes in the public RSS feed**, captured on 30 October 2026: **609 with dates** and **127 without a meaningful historical date**. Episodes exclusive to the paid club and absent from the public feed are not included.

## Explore

- **Series first everywhere:** 148 reviewed release series contain 536 episodes; the other 200 are standalone entries. The timeline, map, index and undated lists show each matching series once. Opening it reveals its parts in release order.
- A compact timeline with text-only entries grouped into **century columns**. Busy centuries expand into adjacent text stacks under one heading, with up to ten fixed rows. The 609 dated episodes become 272 series/single tiles across 39 populated centuries; empty centuries are explicitly marked as omitted.
- Muted colours distinguish series consistently across the timeline, map markers and index cards.
- An Equal Earth map with zoom, drag, touch pinch, keyboard controls and clusters that split as you zoom. Series use their first mappable part as a representative anchor. Selecting **Show on the map** in an episode's details instead highlights that part's own coordinates.
- Episode details include **Show on the timeline** and **Show on the map** independently when applicable. The timeline shortcut reveals the containing series. Location shortcuts clear filters to reveal the item.
- **Episodes not on a timeline** groups undated parts into series and topics. An undated episode can still have a map location, and a dated episode can be Worldwide.
- Search by subject, place, episode number or description; filter by region and era; switch to a series-first index. Filters match individual parts, then show their series with the full release list still accessible.
- Verified direct Pocket Casts and Spotify links for all 736 initial episodes. Apple Podcasts has 209 exact links and otherwise a labelled search. YouTube links are labelled searches. Original public audio can play in the detail view.
- Share individual episodes with `#episode=<RSS GUID>` and series with `#series=<series slug>`. Filters are reflected in the URL.
- Responsive layouts, keyboard navigation, reduced-motion support, no analytics, accounts or application cookies.

Dates are editorial approximations. The timeline displays centuries, while episode details retain the reviewed ranges and placement notes. A series' earliest dated part determines its century; a filtered timeline uses the earliest matching dated part. Conventional century boundaries apply (1901–2000 is the 20th century; 100–1 BCE is the 1st century BCE). Empty centuries are omitted and marked with an ellipsis, so distances are **not a linear time scale**. Entries are ordered chronologically down each stack, then across the century. Dense centuries get additional stacks under the same heading, keeping the table to ten compact rows; sparser selections use fewer fixed rows. Every stack is filled from row zero. Regions remain filters, not fixed rows.

Series memberships and source URLs are maintained in `data/series.json`, based on the official archive and reconciled with the publisher's public feed. Separate later release arcs remain separate series; exact-title changes, missing numbered parts, and annual release sets have explicit research notes. The build assigns `seriesId`, `series` and `seriesOrder` to each episode. Episodes belong to at most one released series.

The map includes every episode through its series or standalone entry. 661 episodes have reviewed approximate subject locations; 75 broad discussions have no single geographic anchor. A series with any mapped part uses its first mappable episode in release order. Individual episode shortcuts preserve the actual part's location. Broad surveys and legendary settings are explicitly labelled. Modern coastlines and borders are for orientation. Location data lives in `data/map-locations-{a,b,c}.json`; new episodes remain Worldwide until reviewed.

## Run locally

Requires Node.js 22+ and Python 3. No npm dependencies or credentials are required.

```sh
npm run dev
# Open http://127.0.0.1:4173
npm test
npm run build
```

`public/` contains the complete website. `npm run build` merges the source snapshots and copies the site to `dist/`. Vercel uses `node scripts/build.mjs` to publish the already-reviewed catalogue without depending on external APIs during deployment. `vercel.json` defines the static build and response headers.

## Update the catalogue

This is a dated snapshot, not a live feed. Refresh it deliberately:

```sh
npm run refresh
npm test
```

This downloads the public RSS feed and Pocket Casts/Apple catalogues, normalizes records, preserves reviewed historical placements, and rebuilds the site. It requires Python 3 and curl. New episodes appear in **New arrivals** until their historical placement is reviewed. To place one, add its RSS GUID to `data/dates-early.json` or `data/dates-late.json`, following the existing schema. Use negative integers for BCE, no year zero, and `null` dates plus a category for subjects without a meaningful period.

The Spotify snapshot is independent of the refresh command. Refresh `data/links-spotify-catalog.json` through the connected Spotify catalogue export (show `spotify:show:7Cvsbcjhtur7nplC148TWy`) to add exact episode URLs. Until then, new items use a clearly labelled Spotify search. A missing Pocket Casts match is omitted instead of linking to an invented episode.

Historical placement sources and cautions are recorded in `data/dates-early-research.json` and `data/dates-late-sources.json`. Official archive matches are a saved reference snapshot and are not automatically extended by RSS refresh. Review the generated files, commit, and push to `main` to deploy through the connected Vercel project.

## Sources

- [Goalhanger public RSS](https://feeds.megaphone.fm/GLT4787413333): episode IDs, titles, descriptions, artwork, audio and publication metadata.
- [Official episode archive](https://archive.therestishistory.com/): cross-checks and canonical archive links.
- [TRIH Episode Explorer](https://trihexplorer.com/): community topic/region clues checked against the episode subjects.
- [Pocket Casts public catalogue](https://podcast-api.pocketcasts.com/mobile/show_notes/full/c507d410-fd89-0138-4167-0acc26574db2): exact audio-URL matching to episode UUIDs. [Official sharing implementation](https://github.com/Automattic/pocket-casts-android/blob/main/modules/services/sharing/src/main/kotlin/au/com/shiftyjelly/pocketcasts/sharing/SharingClient.kt) documents the episode URL format.
- Spotify's connected official-show catalogue: unique title matches and release-date checks.
- [Apple public lookup](https://itunes.apple.com/lookup?id=1537788786&entity=podcastEpisode&limit=200): exact audio-URL matching, with search fallbacks clearly labelled.

Raw public-source snapshots in `data/` are for audit and maintenance; only `public/` is deployed. Descriptions omit repeated promotional boilerplate where possible, and link to the publisher's full entry. Audio streams from the original publisher and is not rehosted. The header uses the publisher’s original transparent wordmark from `https://therestishistory.com/hubfs/TRIH%20BANNER-1.png`, paired with a CSS ORGANIZED stamp. Episode art loads from the publisher's image service, with a local show-art fallback.

The map runs entirely in the browser. D3 7.9.0, TopoJSON Client 3.1.0 and Natural Earth geography via World Atlas 2.0.2 are vendored locally; no mapping API key or geocoding service is required. Sources and licenses are recorded in `public/vendor/`.

## Verification

Automated checks cover feed completeness, unique IDs, valid placements, listening-link kinds, chronology, non-overlapping cards, series membership and release order, century boundaries including BCE/CE, top-filled text stacks, fixed row allocation and height, independent date/map availability, era boundaries, search behavior, complete map coverage, valid coordinates, Equal Earth rendering and cluster separation at increasing zoom levels. Browser verification covers desktop and 320/390/430-pixel mobile layouts, detail dialogs, filters, pagination, deep links and the deployed site.

## Credits

An unofficial fan-made navigation tool, not affiliated with or endorsed by Goalhanger, Tom Holland or Dominic Sandbrook. Podcast wordmark, titles, descriptions, recordings and artwork remain the property of their respective owners. This repository does not grant rights to that content.

Self-hosted **Cormorant Garamond** and **DM Sans** are distributed under the SIL Open Font License; see `public/fonts/` for their licenses.
