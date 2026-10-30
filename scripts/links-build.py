#!/usr/bin/env python3
"""Build verifiable episode links from public podcast catalogues.

Run from any directory: python scripts/links-build.py [--refresh]
--refresh refreshes Pocket Casts and Apple's recent public catalogue. The Spotify
snapshot is exported through the connected Spotify get_collection_items tool:
show spotify:show:7Cvsbcjhtur7nplC148TWy, page_size 60, follow every next_cursor.
Keep only uri/name/url/release_date/parent/creators; never save playback.play_uri.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import quote
from urllib.request import urlopen, Request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PC_SOURCE = "https://podcast-api.pocketcasts.com/mobile/show_notes/full/c507d410-fd89-0138-4167-0acc26574db2"
APPLE_SOURCE = "https://itunes.apple.com/lookup?id=1537788786&entity=podcastEpisode&limit=200"
PC_FORMAT_SOURCE = "https://github.com/Automattic/pocket-casts-android/blob/main/modules/services/sharing/src/main/kotlin/au/com/shiftyjelly/pocketcasts/sharing/SharingClient.kt"


def fetch_json(url: str, path: Path):
    with urlopen(Request(url, headers={"User-Agent": "HistoryAtlas/1.0"}), timeout=45) as response:
        data = json.load(response)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def normalized_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", title).lower())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if args.refresh:
        fetch_json(PC_SOURCE, DATA / "links-pocketcasts-api.json")
        fetch_json(APPLE_SOURCE, DATA / "links-apple-lookup.txt")

    feed_items = ET.parse(DATA / "feed.xml").getroot().find("channel").findall("item")
    pc = json.loads((DATA / "links-pocketcasts-api.json").read_text())["podcast"]["episodes"]
    pc_by_audio = {ep["url"]: ep for ep in pc}
    spotify = json.loads((DATA / "links-spotify-catalog.json").read_text())["episodes"]
    spotify_by_title = defaultdict(list)
    for ep in spotify:
        if ep.get("parent", {}).get("uri") == "spotify:show:7Cvsbcjhtur7nplC148TWy":
            spotify_by_title[normalized_title(ep["name"])].append(ep)
    apple_by_audio = {}
    for path in sorted(DATA.glob("links-apple-lookup*.txt")) + sorted(DATA.glob("links-apple-search*.txt")):
        try:
            entries = json.loads(path.read_text())["results"]
        except (ValueError, KeyError):
            continue
        for ep in entries:
            if ep.get("collectionId") == 1537788786 and ep.get("episodeUrl") and ep.get("trackViewUrl"):
                apple_by_audio[ep["episodeUrl"]] = ep["trackViewUrl"]

    result = []
    missing_pc, missing_spotify = [], []
    for item in feed_items:
        title, guid = item.findtext("title"), item.findtext("guid")
        audio = item.find("enclosure").attrib["url"]
        pc_match = pc_by_audio.get(audio)
        sp_matches = spotify_by_title[normalized_title(title)]
        sp_match = sp_matches[0] if len(sp_matches) == 1 else None
        apple_url = apple_by_audio.get(audio)
        search = "The Rest Is History " + re.sub(r"^\d+[.:]\s*", "", title)
        if not pc_match:
            missing_pc.append(title)
        if not sp_match:
            missing_spotify.append(title)
        result.append({
            "guid": guid,
            "title": title,
            "pocketCasts": "https://pca.st/episode/" + pc_match["uuid"] if pc_match else None,
            "pocketCastsKind": "episode" if pc_match else "missing",
            "spotify": sp_match["url"] if sp_match else "https://open.spotify.com/search/" + quote(search, safe=""),
            "spotifyKind": "episode" if sp_match else "search",
            "applePodcasts": apple_url or "https://podcasts.apple.com/us/search?term=" + quote(search, safe=""),
            "applePodcastsKind": "episode" if apple_url else "search",
            "youtube": "https://www.youtube.com/results?search_query=" + quote(search, safe=""),
            "youtubeKind": "search",
            "audio": audio,
            "matchEvidence": {
                "pocketCasts": "exact audio enclosure URL" if pc_match else None,
                "spotify": "unique normalized title in official Goalhanger show catalogue" if sp_match else None,
                "applePodcasts": "exact audio enclosure URL" if apple_url else None,
            },
        })

    coverage = {
        "feedEpisodes": len(result),
        "pocketCastsDirect": sum(bool(x["pocketCasts"]) for x in result),
        "spotifyDirect": sum(x["spotifyKind"] == "episode" for x in result),
        "appleDirect": sum(x["applePodcastsKind"] == "episode" for x in result),
        "appleSearch": sum(x["applePodcastsKind"] == "search" for x in result),
        "youtubeSearch": len(result),
    }
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "coverage": coverage,
        "sources": {
            "pocketCasts": PC_SOURCE,
            "pocketCastsLinkFormat": PC_FORMAT_SOURCE,
            "spotify": "Spotify connector: spotify:show:7Cvsbcjhtur7nplC148TWy",
            "applePodcasts": APPLE_SOURCE,
            "youtubeChannel": "https://www.youtube.com/channel/UCUYK0BJZF3yNb2fw1EdAXUQ",
        },
        "notes": [
            "Pocket Casts IDs are matched using the exact feed enclosure URL. Its own Android sharing code supplies the pca.st/episode/{uuid} format.",
            "Spotify URLs are preserved exactly as returned by the connected catalogue tool. No account library changes were made.",
            "Search links are explicitly identified with the corresponding Kind field and must be labelled 'Find on …', not as direct episode links.",
            "YouTube uploads may use different titles or combine episodes; no video URL is guessed.",
            "Only episodes available in the public RSS feed are included; membership-only episodes are outside this catalogue.",
        ],
        "unmatched": {"pocketCasts": missing_pc, "spotify": missing_spotify},
        "episodes": result,
    }
    (DATA / "links-episodes.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(coverage))
    if missing_pc or missing_spotify:
        print("Some newly published episodes need a refreshed catalogue snapshot; see unmatched in links-episodes.json.")


if __name__ == "__main__":
    main()
