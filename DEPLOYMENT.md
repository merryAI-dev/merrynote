# MerryNote Deployment Strategy

## Positioning

MerryNote today is not a normal web app. It is a `macOS collector + local dashboard` product with cloud aspirations.

Current local-only coupling:

- `Voice Memos` automation and `osascript`
- Apple `SFSpeechRecognizer` with custom vocab injection
- local file paths for notes, vocab, and logs
- `launchctl` and `fswatch` daemon workflows

That means the right hosted move is not "deploy the existing desktop flow to the internet as-is".

The right v1 is:

`Hosted control room`

- browse notes
- edit vocab
- view stats and governance signals
- keep the current Mac automation as a separate collector path

## CEO Review Recommendation

Mode: `SELECTIVE EXPANSION`

- Keep the magical wedge: meetings become structured notes with decisions, action items, and open issues.
- Do not drag macOS-only automation into the hosted product boundary.
- Ship a smaller, cleaner hosted surface first.

## Recommended Platform

### Phase 1: Render

Best current target for this repo:

- `Render Web Service`
- one `Persistent Disk`
- hosted-mode env vars

Why:

- easiest way to host the existing Node dashboard without pretending the app is already cloud-native
- simple Blueprint flow via `render.yaml`
- persistent disk gives the current file-based notes/vocab/log model somewhere stable to live

Important constraint:

- Render persistent disks are attached to a single service instance, so this phase should stay `single-service`
- do not add a separate worker until jobs and state move off the shared filesystem

### Phase 2: Cloud-native expansion

When you are ready to support real browser uploads and shared workspaces:

- `Render Web Service` or `Cloud Run` for API
- `Background Worker` or `Cloud Run Jobs` for transcription/summarization
- `Postgres` for notes, jobs, vocab, workspaces
- `R2` or `S3` for raw audio and artifacts

Move to this phase only after replacing file-path ingestion with browser upload + async job processing.

## What Ships In Hosted Mode Today

Hosted mode should support:

- dashboard
- note browsing and deletion
- vocab viewing/editing
- stats
- SSE log stream

Hosted mode should explicitly disable:

- `/api/record/start`
- `/api/record/stop`
- `/api/transcribe` with server-local file paths
- `launchctl` daemon start/stop

This repo now exposes `GET /api/runtime` and `GET /healthz`, and the UI disables local-only actions when hosted mode is active.

## Render Blueprint

The included [render.yaml](./render.yaml) is intentionally narrow:

- one web service
- one persistent disk
- no fake worker
- no unused database resource

This is deliberate. The current codebase does not use Postgres or a queue yet, so provisioning them now would create cost and false complexity.

## Required Runtime Settings

The Blueprint sets:

- `MERRYNOTE_HOSTED_MODE=1`
- `MERRYNOTE_DATA_DIR=/var/data/merrynote`
- `MERRYNOTE_NOTES_DIR=/var/data/merrynote/notes`
- `MERRYNOTE_VOCAB_DIR=/var/data/merrynote/vocab`
- `MERRYNOTE_LOG_FILE=/var/data/merrynote/logs/merrynote.log`

In hosted mode, the server:

- binds to `0.0.0.0`
- honors Render's `PORT`
- stops trying to auto-open a browser
- seeds vocab files into the mounted data directory on first boot

## Next Product Cut

To turn MerryNote into a real hosted product, build this next:

1. Browser audio upload directly to object storage
2. Async job creation instead of local file path transcription
3. Worker execution plane for transcription and note generation
4. Auth and workspace model
5. Database-backed notes, vocab, and jobs

Do not start with multi-tenant collaboration before the upload-to-job path exists.

## Non-Recommendations

### Vercel as primary runtime

Not recommended for this repo's first hosted version. It pushes you immediately into workarounds for audio ingestion and long-running jobs.

### Cloudflare Workers as primary runtime

Good control plane, not the best first home for the core MerryNote processing path.

## Rollout Order

1. Deploy the hosted control room on Render
2. Verify note browsing, vocab editing, and hosted-mode guardrails
3. Add browser upload + async processing
4. Introduce DB/object storage
5. Split API and worker planes if throughput justifies it
