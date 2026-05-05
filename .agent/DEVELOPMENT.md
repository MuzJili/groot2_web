# Development

## Communication

- Default to Chinese when talking with the maintainer.
- Keep public docs simple and readable for open-source users.
- `README.md` is the primary Chinese document.
- `README_en.md` is the separate English document.

## Scope

- Keep this project standalone and small.
- Do not add ROS 2 runtime dependencies to this web tool.
- Keep `server.py` as the Python HTTP-to-ZeroMQ bridge.
- Keep the frontend static and dependency-free unless a feature truly needs a
  build tool.
- Python dependencies are listed in `requirements.txt`; keep dependency changes
  explicit and documented in both README files.
- Preserve the project name `groot2_web`.
- Preserve existing file names, UI labels, API paths, and public naming unless
  the maintainer explicitly asks for a rename.

## Privacy

- Do not commit local usernames, absolute personal machine paths, tokens,
  account secrets, or machine-specific private details.
- Use placeholders such as `/path/to/your/project` in public docs.
- Before publishing documentation changes, run the privacy scan from this file
  or an equivalent targeted scan.

## Verification

Run the smallest relevant checks for the changed files.

From repository root:

```bash
PYTHONPYCACHEPREFIX=/tmp/groot2_web_pycache python3 -m py_compile groot2_web/server.py
node --check groot2_web/static/app.js
```

Before public release, also run a targeted privacy scan for known private
identifiers, absolute local paths, usernames, emails, and token-like strings.
Do not write real private identifiers into committed docs just to document the
scan command.

From inside `groot2_web`:

```bash
PYTHONPYCACHEPREFIX=/tmp/groot2_web_pycache python3 -m py_compile server.py
node --check static/app.js
python3 -B server.py --bind 127.0.0.1 --port 8765
```

When the server is running, use this for a quick runtime check:

```bash
curl http://127.0.0.1:8765/api/health
```

## Git

- `groot2_web` is an independent git repository.
- Keep changes focused and avoid mixing unrelated edits.
- Do not commit generated caches, virtual environments, or local logs.

## Memory Sync

Every time an agent changes any file under `groot2_web`, append an entry to
`.agent/MEMORY.md`.

Each entry should record:

- date
- intent
- files changed
- important decisions
- verification commands and results
- follow-up risks or TODOs

If verification was not run, say so explicitly.
