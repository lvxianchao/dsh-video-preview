# AGENTS.md — dsh-video-preview

A streaming video preview for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web UI sidebar. Click an `mp4` / `m4v` / `webm` / `ogv` / `ogg` / `mov` file and it plays in place over an authenticated byte-range route (`206 Partial Content`), so seeking is instant and large files are never read whole.

| | |
| --- | --- |
| Package | `@lvxianchao/dsh-video-preview` (npm, MIT) |
| Current version | 1.1.1 |
| Runtime | Node.js >= 22.19, no runtime dependencies, no build step |
| Install target | a DSH profile's bundle list (`web` by default); the browser half loads through `dsh.client` |

## Install

```bash
dsh plugin --profile web add @lvxianchao/dsh-video-preview
dsh plugin --profile web add "github:lvxianchao/dsh-video-preview"   # from GitHub
dsh plugin --profile web add /path/to/dsh-video-preview              # from a checkout
sudo systemctl restart dsh-web                                       # adapt to the deployment
```

The package declares `dsh.bundle`, so no manual `cordis.patch.yml` row is needed.

## Verify

Browser: type `@` in the composer, pick an `.mp4` (or open a video from the workspace changes), click the reference. The player starts muted; the native controls unmute and seek.

Wire check — DevTools → Network: the preview issues `GET /api/video-preview.stream…` requests answering `206` with a `Content-Range` header, plus one `GET /api/video-preview.stat…`. If the file does not play, check the codec (H.264/AAC mp4 is the safe choice), the container (no `mkv`), and that the browser session is signed in — the routes live behind the same auth fence as `/api`.

Production topology (browser → dsh-web-guard → DSH): `test/e2e-guard.mjs` asserts the ranges still arrive through the gate.

## Configure

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: video-preview
  config:
    rangeBytes: 4194304   # per-request window; the workspace backend cap still applies
```

## Develop / test

```bash
git checkout dev                 # main only ever carries released code
DSH_HOME=/tmp/dsh-test-home dsh --profile web \
  --patch ./test/shadow.patch.yml --host 127.0.0.1 --port 3199 --no-open

SHADOW_URL='http://127.0.0.1:3199/?token=...' CHROME=/path/to/chrome \
  VIDEO=test-video.mp4 node test/e2e.mjs
```

`test/record-demo.mjs` regenerates `docs/demo.gif` (needs `puppeteer-core` and a Chrome binary). `test/e2e-guard.mjs` needs dsh-web-guard installed in the same shadow profile — see `test/guard.patch.yml`.

Release: bump `package.json` + add a CHANGELOG entry, merge `dev` into `main` with `--ff-only`, tag `v<version>`, push the tag. CI publishes to npm with provenance and cuts the GitHub release; a tag that disagrees with `package.json` fails the run.

## Repository map

| Path | Role |
| --- | --- |
| `lib/index.js` | host half: registers `GET/HEAD /api/video-preview.stream` and `GET /api/video-preview.stat` on `connection.fetch`; range parsing, `206` / `416` / `Content-Range` |
| `lib/client.js` | browser half: renderer metadata and the player, loaded through `window.__ModuleLoader__` |
| `lib/*.d.ts` | public type surface |
| `test/` | shadow overlays, E2E scripts (plain + through the guard), demo recorder |
| `docs/` | demo GIF, screenshot |

Companion plugin: [dsh-web-guard](https://github.com/lvxianchao/dsh-web-guard) (password gate for the same Web UI; put it in front when the UI is reachable beyond loopback).
