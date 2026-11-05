# Changelog

## 0.2.0 — 2026-11-05

Streaming.

### Features

- **Authenticated byte-range streaming** — the host half registers `GET/HEAD /api/video-preview.stream` and `GET /api/video-preview.stat` on Connection's fetch fence. `readBytes(range)` serves `206 Partial Content` windows, so the browser seeks without a complete-byte read and the platform's 32 MB complete-file cap no longer applies to videos.
- **Renderer-owned loading** — the renderer metadata switches to `loading: "renderer"`; the body points a native `<video>` at the stream route, reports its loaded version from the stat route, and shows size/format metadata.
- **`rangeBytes` config** — per-request stream window, default 2 MiB.

### Verification

- Unit: range parsing, 206/416/HEAD/404/400 status mapping, and scope resolution against a fake context.
- E2E (shadow instance, headless Chrome): a 35 MB / 200 s MP4 plays, serves 206 ranges, seeks to 196 s, and shows the stat-driven size line.

## 0.1.0 — 2026-11-05

First release: Blob-based playback of complete file bytes (32 MB platform cap applied), muted autoplay, metadata line.
