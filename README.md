# the rest is history:**ORDERED**

An independent companion to **The Rest Is History**, arranged by the history being discussed rather than the date an episode was released.

**Live:** https://history.jakub.computer

The initial catalogue contains all **736 episodes in the public RSS feed**, captured on 30 October 2026: **609 on the timeline** and **127 in themed collections below it**. Episodes exclusive to the paid club and absent from the public feed are not included.

## Explore

- A compact chronological timeline with rows for concurrent episode series, a sticky date axis, era filters, arrow controls, and a full-range slider. Region filtering remains available.
- An Equal Earth world map with zoom, drag, touch pinch, keyboard controls and clusters that split as you zoom. Select a single marker to open an episode; a shared-location group opens a paginated episode list. The map follows the search, region and era filters.
- Search by subject, place, episode number or description; filter by region; switch to a paginated index.
- Episode details with historical range and placement rationale, publisher description, release date, duration, artwork, series navigation and original public audio.
- All 736 initial episodes have verified direct Pocket Casts and Spotify links. Apple Podcasts has 209 exact links and otherwise a labelled search. YouTube links are labelled searches.
- Share individual episodes with `#episode=<RSS GUID>`; filters are reflected in the URL.
- Responsive layouts, keyboard navigation, reduced-motion support, no analytics, accounts or application cookies.

Dates are editorial approximations. The start of the covered period determines ordering and era membership. Cards expand the available space, so distances are **not a linear time scale**. The timeline starts with the earliest episode. Related episodes share a row, concurrent series occupy separate rows, and available rows are reused. The complete table reserves its maximum row count for the selected episodes, so horizontal scrolling never changes row positions or table height. Regions are metadata for filtering, not fixed rows. Undatable discussions are categorized separately.

The map includes every episode: 661 have a reviewed approximate subject location, while 75 discussions without a meaningful geographic anchor are accessible through **Worldwide**. Broad surveys and legendary settings are explicitly labelled. Modern coastlines and borders are for orientation, not historical boundaries. Locations and explanations are maintained in `data/map-locations-a.json`, `data/map-locations-b.json` and `data/map-locations-c.json`, then merged into the catalogue during the build. New episodes remain in Worldwide until their map placement is reviewed.

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

Raw public-source snapshots in `data/` are for audit and maintenance; only `public/` is deployed. Descriptions omit repeated promotional boilerplate where possible, and link to the publisher's full entry. Audio streams from the original publisher and is not rehosted. Episode art loads from the publisher's image service, with a local show-art fallback.

The map runs entirely in the browser. D3 7.9.0, TopoJSON Client 3.1.0 and Natural Earth geography via World Atlas 2.0.2 are vendored locally; no mapping API key or geocoding service is required. Sources and licenses are recorded in `public/vendor/`.

## Verification

Automated checks cover feed completeness, unique IDs, valid placements, listening-link kinds, chronology, non-overlapping cards, shared dates across concurrent series and fixed row positions and height, era boundaries, search behavior, complete map coverage, valid coordinates, Equal Earth rendering and cluster separation at increasing zoom levels. Browser verification covers desktop and 320/390/430-pixel mobile layouts, detail dialogs, filters, pagination, deep links and the deployed site.

## Credits

An unofficial fan-made navigation tool, not affiliated with or endorsed by Goalhanger, Tom Holland or Dominic Sandbrook. Podcast titles, descriptions, recordings and artwork remain the property of their respective owners. This repository does not grant rights to that content.

Self-hosted **Cormorant Garamond** and **DM Sans** are distributed under the SIL Open Font License; see `public/fonts/` for their licenses.
