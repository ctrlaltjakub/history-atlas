#!/usr/bin/env python3
"""Install this project's deterministic weekly-review timer for the current Linux user."""
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
codex = shutil.which('codex')
if not codex or not shutil.which('systemctl'):
    raise SystemExit('This local timer requires Linux systemd and an authenticated Codex CLI.')


def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


units = Path.home() / '.config/systemd/user'
units.mkdir(parents=True, exist_ok=True)
service = units / 'history-atlas-review.service'
timer = units / 'history-atlas-review.timer'
service.write_text(f'''[Unit]
Description=Review and publish The Rest Is History catalogue when due

[Service]
Type=oneshot
WorkingDirectory={str(root).replace('%', '%%')}
Environment={quote('PATH=' + str(Path(codex).parent) + ':/usr/local/bin:/usr/bin:/bin')}
ExecStart={quote(sys.executable)} {quote(root / 'scripts/weekly-review-gate.py')}
TimeoutStartSec=2h
''')
timer.write_text('''[Unit]
Description=Check whether a weekly history catalogue review is due

[Timer]
OnStartupSec=2min
OnCalendar=*-*-* *:0/5:00
Persistent=true
AccuracySec=30s
Unit=history-atlas-review.service

[Install]
WantedBy=timers.target
''')
subprocess.run(['systemd-analyze', '--user', 'verify', str(service), str(timer)], check=True)
subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
subprocess.run(['systemctl', '--user', 'enable', '--now', timer.name], check=True)
print(f'Installed {timer}. Every five minutes, plain Python checks the app and review marker; Codex runs only when due.')
