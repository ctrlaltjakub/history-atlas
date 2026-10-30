#!/usr/bin/env python3
"""Refresh the public RSS snapshot without inventing dates for new episodes.

Use --from-file to normalize the saved feed without a network request.
"""
import argparse
import html
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
SOURCE = 'https://feeds.megaphone.fm/GLT4787413333'
NS = {'itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd'}


def normalize(xml):
    channel = ET.fromstring(xml).find('channel')
    if channel is None or channel.findtext('title') != 'The Rest Is History':
        raise ValueError('The response is not the expected podcast feed.')
    image = channel.find('itunes:image', NS)
    fallback = image.get('href') if image is not None else '/images/show.jpg'
    episodes = []
    for item in channel.findall('item'):
        title, guid = item.findtext('title'), item.findtext('guid')
        enclosure = item.find('enclosure')
        if not title or not guid or enclosure is None:
            raise ValueError('Feed episode is missing its title, ID or audio.')
        published = parsedate_to_datetime(item.findtext('pubDate'))
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        duration = item.findtext('itunes:duration', default='0', namespaces=NS)
        seconds = 0
        for part in duration.split(':'):
            seconds = seconds * 60 + int(part or 0)
        episode_image = item.find('itunes:image', NS)
        number = item.findtext('itunes:episode', namespaces=NS)
        description = item.findtext('description') or item.findtext('itunes:summary', default='', namespaces=NS)
        description = re.sub(r'<(?:br\s*/?|/p)>', '\n\n', description, flags=re.I)
        description = html.unescape(re.sub(r'<[^>]+>', '', description))
        episodes.append(dict(
            id=guid, title=title, number=int(number) if number and number.isdigit() else None,
            description=description, audio=enclosure.get('url'),
            published=published.astimezone(timezone.utc).isoformat(), duration=str(seconds),
            image=episode_image.get('href') if episode_image is not None else fallback,
            type=item.findtext('itunes:episodeType', default='full', namespaces=NS),
        ))
    if not episodes or len({e['id'] for e in episodes}) != len(episodes):
        raise ValueError('The feed is empty or contains duplicate IDs.')
    return episodes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-file', action='store_true')
    args = parser.parse_args()
    feed_path = DATA / 'feed.xml'
    metadata_path = DATA / 'catalogue-source.json'
    fetched_at = datetime.now(timezone.utc).isoformat()
    if args.from_file:
        xml = feed_path.read_bytes()
        fetched_at = (json.loads(metadata_path.read_text())['fetchedAt'] if metadata_path.exists()
                      else datetime.fromtimestamp(feed_path.stat().st_mtime, timezone.utc).isoformat())
    else:
        xml = subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                              '--max-time', '60', SOURCE], check=True, capture_output=True).stdout
    episodes = normalize(xml)
    # Validate everything before replacing the existing snapshot.
    if not args.from_file:
        temporary = DATA / 'feed.xml.tmp'
        temporary.write_bytes(xml)
        temporary.replace(feed_path)
    for filename, value in [('base-episodes.json', episodes), ('catalogue-source.json', dict(source=SOURCE, fetchedAt=fetched_at))]:
        target = DATA / filename
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(target)
    print(f'Normalized {len(episodes)} public episodes. Historical placements remain unchanged.')


if __name__ == '__main__':
    main()
