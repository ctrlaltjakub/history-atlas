#!/usr/bin/env python3
"""Cheap local scheduler gate: start Codex only for a due weekly review."""
import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
ZONE = ZoneInfo('Europe/Busingen')


def review_week(now):
    day = now.astimezone(ZONE).date()
    return (day - timedelta(days=(day.weekday() - 5) % 7)).isoformat()


def app_running(proc=Path('/proc')):
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if entry.stat().st_uid == os.getuid() and (entry / 'comm').read_text().strip() == 'ChatGPT':
                return True
        except (OSError, ProcessLookupError):
            continue
    return False


def load_json(path):
    return json.loads(path.read_text()) if path.exists() else {}


def decision(now, marker, app_open, state):
    week = review_week(now)
    unfinished = state.get('weekStarting') == week and state.get('success') is not True
    if marker.get('lastReviewedWeek', '') >= week and not unfinished:
        return 'already-reviewed'
    if not app_open:
        return 'waiting-for-app'
    last = state.get('attemptStartedAt')
    if last and now - datetime.fromisoformat(last) < timedelta(hours=6):
        return 'retry-backoff'
    return 'due'


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()


def notify(title, body):
    if shutil.which('notify-send'):
        subprocess.run(['notify-send', '--app-name=History catalogue', title, body], check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Print the decision without launching an agent or changing files.')
    parser.add_argument('--at', help='ISO date/time for a --check simulation only.')
    args = parser.parse_args()
    if args.at and not args.check:
        parser.error('--at requires --check')
    now = datetime.fromisoformat(args.at) if args.at else datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=ZONE)
    state_dir = Path.home() / '.local/state/history-atlas-review'
    marker_path = ROOT / 'data/catalogue-review.json'
    state_path = state_dir / 'last-attempt.json'
    result = decision(now, load_json(marker_path), app_running(), load_json(state_path))
    print(json.dumps({'decision': result, 'weekStarting': review_week(now)}), flush=True)
    if args.check or result != 'due':
        return 0

    os.umask(0o077)
    state_dir.mkdir(parents=True, exist_ok=True)
    with (state_dir / 'review.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('A weekly review is already running.')
            return 0
        # A dirty checkout or another branch is left alone; the timer tries later.
        if git('branch', '--show-current') != 'main' or git('status', '--porcelain'):
            print('Waiting for a clean main checkout; no agent started.')
            return 0
        # Refresh the marker from GitHub before deciding to spend an agent run.
        subprocess.run(['git', '-C', str(ROOT), 'fetch', 'origin'], check=True, timeout=90)
        behind = subprocess.run(['git', '-C', str(ROOT), 'merge-base', '--is-ancestor', 'HEAD', 'origin/main']).returncode == 0
        if behind:
            subprocess.run(['git', '-C', str(ROOT), 'merge', '--ff-only', 'origin/main'], check=True, timeout=90)
        if decision(now, load_json(marker_path), app_running(), load_json(state_path)) != 'due':
            print('No longer due after synchronising the checkout.')
            return 0
        codex = shutil.which('codex')
        if not codex:
            raise RuntimeError('Codex CLI is not on PATH.')
        stamp = now.astimezone(timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
        report = state_dir / f'{stamp}-summary.md'
        log = state_dir / f'{stamp}.log'
        state = {'attemptStartedAt': now.isoformat(), 'weekStarting': review_week(now), 'report': str(report), 'log': str(log)}
        state_path.write_text(json.dumps(state, indent=2) + '\n')
        prompt = (ROOT / 'scripts/weekly-review-prompt.md').read_text()
        # Inherit the user's existing model and permission settings. No new API key.
        command = [codex, '--search', 'exec', '--cd', str(ROOT), '--color', 'never', '--output-last-message', str(report), '-']
        with log.open('w') as output:
            try:
                run = subprocess.run(command, input=prompt, text=True, stdout=output, stderr=subprocess.STDOUT, timeout=6900)
                code = run.returncode
            except subprocess.TimeoutExpired:
                code = 124
        reviewed = load_json(marker_path).get('lastReviewedWeek', '') >= review_week(now)
        published = not git('status', '--porcelain') and git('rev-parse', 'HEAD') == git('rev-parse', 'origin/main')
        success = code == 0 and reviewed and published
        state.update(finishedAt=datetime.now(timezone.utc).isoformat(), success=success, exitCode=code)
        state_path.write_text(json.dumps(state, indent=2) + '\n')
        if success:
            notify('History catalogue review complete', f'The reviewed update is published. Summary: {report}')
        else:
            notify('History catalogue review needs attention', f'Check the saved summary and log in {state_dir}')
        return 0 if success else 1


if __name__ == '__main__':
    raise SystemExit(main())
