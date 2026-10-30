# The History Atlas

A cozy, independent companion to **The Rest Is History**, arranged by the history being discussed rather than the date an episode was released.

**Live:** https://history.jakub.computer

The initial catalogue contains all **736 episodes in the public RSS feed**, captured on 30 October 2026: **609 on the timeline** and **127 in themed collections below it**. Episodes exclusive to the paid club and absent from the public feed are not included.

## Explore

- A horizontal chronological timeline with eight regional lanes, sticky date and region labels, era filters, arrow controls, and a full-range slider.
- Search by subject, place, episode number or description; filter by region; switch to a paginated index.
- Episode details with historical range and placement rationale, publisher description, release date, duration, artwork, series navigation and original public audio.
- All 736 initial episodes have verified direct Pocket Casts and Spotify links. Apple Podcasts has 209 exact links and otherwise a labelled search. YouTube links are labelled searches.
- Share individual episodes with `#episode=<RSS GUID>`; filters are reflected in the URL.
- Responsive layouts, keyboard navigation, reduced-motion support, no analytics, accounts or application cookies.

Dates are editorial approximations. The start of the covered period determines ordering and era membership. Cards expand the available space, so distances are **not a linear time scale**. The atlas opens around 3000 BCE; prehistory remains accessible to the left. Cross-regional episodes use the region central to their subject or the shared world lane. Undatable discussions are categorized separately.

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

## Verification

Automated checks cover feed completeness, unique IDs, valid placements, listening-link kinds, chronology, non-overlapping cards, shared dates across regions, era boundaries and search behavior. Browser verification covers desktop and 320/390/430-pixel mobile layouts, detail dialogs, filters, pagination, deep links and the deployed site.

## Credits

An unofficial fan-made navigation tool, not affiliated with or endorsed by Goalhanger, Tom Holland or Dominic Sandbrook. Podcast titles, descriptions, recordings and artwork remain the property of their respective owners. This repository does not grant rights to that content.

Self-hosted **Cormorant Garamond** and **DM Sans** are distributed under the SIL Open Font License; see `public/fonts/` for their licenses.
