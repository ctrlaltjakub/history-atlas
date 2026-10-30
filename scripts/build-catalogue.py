#!/usr/bin/env python3
"""Merge publisher data, explicitly reviewed historical dates, and verified links."""
import json, re, html
from pathlib import Path
from datetime import datetime, timezone
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'

def read(name):
    return json.loads((DATA/name).read_text())

base = read('base-episodes.json')
placements = read('dates-early.json') | read('dates-late.json')
locations = read('map-locations-a.json') | read('map-locations-b.json') | read('map-locations-c.json')
for e in base:
    if e['id'] in placements:
        continue
    title=e['title']
    p=dict(start=None,end=None,region='Across the world',dateLabel='Across the ages',category='Conversations & reflections',note='A conversation bringing together subjects from different historical periods.')
    if 'The Beatles:' in title:
        second='Part 2' in title
        p=dict(start=1964 if second else 1956,end=1970 if second else 1964,region='Britain & Ireland',dateLabel='1964–1970' if second else '1956–1964',category=None,note='The Beatles’ international fame and final years.' if second else 'The formation of the band and its rise from Liverpool to worldwide fame.')
    elif '172.' in title:
        p=dict(start=1982,end=2016,region='Across the world',dateLabel='1982–2016',category=None,note='The aftermath of the Falklands War in Britain and Argentina, including the later debate about Brexit. Placed at the start of its aftermath.')
    elif "Disney's Legacy" in title:
        p.update(region='Americas',note='A wide-ranging interview with Bob Iger about Disney and his own career, rather than a single historical narrative.')
    elif title.startswith('12 Days:'):
        p.update(note='An “on this day” conversation pairing events from different centuries. A calendar anniversary is not a single historical period.')
    elif 'Kings and Queens' in title:
        p.update(region='Britain & Ireland',category='Ideas & everyday life',note='A playful comparison of monarchs across centuries, without one historical period.')
    else:
        p.update(category='New arrivals',note='New in the public feed. Historical placement has not yet been reviewed.')
    placements[e['id']]=p

link_data=read('links-episodes.json')
links={e['guid']:e for e in link_data['episodes']}
official=read('official-matches.json')
official_data={e['id']:e for e in read('official-catalogue.json')}

def clean_desc(text):
    text=html.unescape(text or '').replace('\u2060','').replace('\xa0',' ')
    # Historical descriptions remain intact; remove duplicated tours, club pitches and ad copy.
    text=re.split(r'\*?The Rest Is History Live Tour|\*?The Rest is History Live Tour|Join The Rest Is History Club|Join The Rest is History Club|Join the rest is history club|If you enjoyed this series|Would you like to join|For more Goalhanger|Become a member|Learn more about your ad choices|Advertise with us:|Twitter:|_{3,}',text,flags=re.I)[0]
    text=re.sub(r'^\|[^\n]+\|\s*','',text)
    text=re.sub('<[^>]+>','',text)
    text=re.sub(r'\n{3,}','\n\n',text)
    return text.strip(' \n*')

def series_name(e,title):
    if '12 Days:' in title:return '12 Days of Christmas'
    if re.search(r'\(Part \d+\)|\bpart \d+$',title,re.I):
        if ':' in title:return title.split(':',1)[0].strip()
        return re.sub(r'\s*\(?Part \d+\)?','',title,flags=re.I).strip()
    return ''

out=[]
for e in base:
    p=placements[e['id']]
    title=re.sub(r'^\s*\d+[.:]\s*','',e['title']).strip()
    description=clean_desc(e['description'])
    official_id=official.get(e['id'])
    if len(description)<30 and official_id:
        description=clean_desc(official_data[official_id]['description'])
    link=links.get(e['id'])
    if not link:
        raise ValueError(f"Missing listening links: {e['title']}")
    number=e['number']
    prefix=re.match(r'^\s*(\d+)[.:]',e['title'])
    if prefix:number=int(prefix[1])
    if e.get('type')=='trailer':number=None
    location=locations.get(e['id'],dict(coordinates=None,label='Worldwide',note='New in the public feed. Map placement has not yet been reviewed.'))
    out.append(dict(id=e['id'],number=number,title=title,description=description,published=e['published'],duration=e['duration'],image=e['image'],audio=e['audio'],**p,series=series_name(e,title),location=location,officialUrl=f'https://archive.therestishistory.com/catalog/episode/{official_id}' if official_id else None,links={k:link.get(k) for k in ['pocketCasts','spotify','spotifyKind','applePodcasts','applePodcastsKind','youtube']}))

assert len(out)==len(base)==len({e['id'] for e in out})
assert all(e['start'] is None or (isinstance(e['start'],int) and e['start']<=e['end'] and e['start']!=0 and e['end']!=0) for e in out)
assert all(e['category'] if e['start'] is None else e['category'] is None for e in out)
target=ROOT/'public'/'data'; target.mkdir(exist_ok=True,parents=True)
updated=read('catalogue-source.json')['fetchedAt']
result=dict(updatedAt=updated,source='https://feeds.megaphone.fm/GLT4787413333',episodes=out)
(target/'catalogue.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
print(f"Catalogue: {len(out)} total, {sum(e['start'] is not None for e in out)} dated, {sum(e['start'] is None for e in out)} beyond time. {len((target/'catalogue.json').read_bytes()):,} bytes.")
