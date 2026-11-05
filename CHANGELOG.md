# Changelog

## 1.1.1 — 2026-11-05

### Added

- **`funding` metadata** — npm now links the sponsor options (Afdian / Ko-fi) from the package page, matching the README's Sponsor section.

### Packaging

- First release published by CI through the npm **trusted publisher** (OIDC, provenance), which also validates that configuration.

## 1.1.0 — 2026-11-05

### Added

- **Plugin-list metadata** — `locale/en.json` and `locale/zh.json` carry the localized title and description the DSH plugin list shows, the same convention dsh-web-guard uses.
- **Guard-path E2E** — `test/e2e-guard.mjs` walks browser → dsh-web-guard → DSH and asserts byte-range streaming (`206` + `Content-Range`) survives the auth proxy.
- **npm distribution** — the package is published as `@lvxianchao/dsh-video-preview`; pushing a `v*` tag now publishes it with provenance and cuts the GitHub release from CI.

### Docs

- The Related section now points at **dsh-web-guard** (renamed from `dsh-guard`), with its npm install command.

## 1.0.0 — 2026-11-05

First stable release. A streaming video preview for the DSH Web UI sidebar.

### Features

- **Video renderer** — registers `mp4` / `m4v` / `webm` / `ogv` / `ogg` / `mov` into the document-preview registry with `loading: "renderer"`, so the preview framework never performs a complete-byte read for videos.
- **Authenticated byte-range streaming** — the host half registers `GET/HEAD /api/video-preview.stream` and `GET /api/video-preview.stat` on Connection's fetch fence. `workspaceFiles.readBytes(range)` serves `206 Partial Content` windows, so seeking is instant and the platform's 32 MB complete-file cap does not apply.
- **Player** — muted autoplay, native controls, filename/format/size metadata, and a readable failure line for unsupported codecs.
- **`rangeBytes` config** — per-request stream window, default 2 MiB.
- **Zero runtime dependencies, no build step** — the browser half is a hand-written `__ModuleLoader__` module; React comes from the host.

### Verification

- Unit: range parsing, `206`/`416`/`HEAD`/`404`/`400` status mapping, and workspace-scope resolution against a fake context.
- E2E (shadow instance, headless Chrome): a 35 MB / 200 s MP4 plays, serves `206` ranges, seeks to 196 s, and shows the stat-driven size line — including when installed from the published Git tag.

## 0.1.0 — 2026-11-05

Preview release: Blob-based playback of complete file bytes (32 MB platform cap applied), muted autoplay, metadata line.
