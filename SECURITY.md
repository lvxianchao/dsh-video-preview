# Security policy

## Supported versions

The latest release on `main`. Fixes ship in the next release, not in older versions.

| Version | Supported |
| --- | --- |
| 1.x (latest) | ✅ |
| older | ❌ |

## Report a vulnerability

Use GitHub's **private vulnerability reporting** — do not open a public issue:

<https://github.com/lvxianchao/dsh-video-preview/security/advisories/new>

Please include the affected version, how it was installed (npm / GitHub / local checkout), reproduction steps and the impact you see. This is a spare-time project with no bug bounty; an initial reply is best effort, usually within about a week.

## What this plugin is responsible for

- The streaming route `GET/HEAD /api/video-preview.stream`: path resolution through the session's workspace scope, `Range` parsing, and correct `206` / `Content-Range` / `416` responses.
- The stat route `GET /api/video-preview.stat`.
- Staying inside the same authenticated fetch fence as every other `/api` route: no unauthenticated file serving, no path escaping the workspace scope, no bypass of `dsh-web-guard` when it is in front.
- Never reading more than the requested byte window per request (the `rangeBytes` config, clamped by the workspace backend's cap).

## Out of scope

- DSH's own auth fence and document-preview framework; the harness and any gate in front of it are their own projects.
- Browser or codec vulnerabilities triggered by decoding a video file — decoding happens in the browser.
- The contents of the video files themselves.
- Denial of service by an authenticated user who can already read the workspace files being streamed.
- Stocking/streaming `mkv` or other containers the browser cannot decode (a documented limitation, not a vulnerability).

## Notes

- The routes add no authority: they resolve the file through the same session the file preview already uses.
- There are no runtime dependencies, no build step and no third-party code in the request path. `puppeteer-core` is a development-only dependency of the demo/E2E scripts in `test/`.
