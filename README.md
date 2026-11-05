# dsh-video-preview

A **video preview** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web UI sidebar. Click an `.mp4`, `.webm` or `.mov` in the file tree, an `@` reference, or the workspace-changes list, and it plays in place — instead of "preview is not available for this file type yet".

DSH's built-in document preview registers text, PDF, Excel and images. **Video is not one of them.** This plugin adds that renderer: `mp4` / `m4v` / `webm` / `ogv` / `ogg` / `mov`.

> 中文说明：[README.zh.md](README.zh.md)

## Features

- **Click and play** — suffix-matched renderer reads the complete file bytes and plays them from a local Blob; nothing leaves the host.
- **Muted autoplay** — browsers refuse audible autoplay, so the preview starts silently; the native controls unmute in one click.
- **Useful metadata** — filename, container format, size.
- **Readable failures** — an unsupported codec or container says so instead of showing a blank player.
- **Zero runtime dependencies** — React comes from the host; everything else is standard browser API. **No build step**: the browser half is a hand-written `__ModuleLoader__` module.
- **No host coupling** — registers through the public `documentPreviews` / `slots` / `locale` services only, so it survives harness upgrades.

## Install

```bash
# from a local checkout
dsh plugin --profile web add /path/to/dsh-video-preview

# from GitHub, pinned to a release — recommended
dsh plugin --profile web add "github:lvxianchao/dsh-video-preview#v0.1.0"
```

Restart `dsh` afterwards (the Web UI reloads its frontend modules on boot):

```bash
sudo systemctl restart dsh-web   # adapt to your deployment
```

The package declares `dsh.bundle`, so installing it appends the package to the profile's bundle list and mounts the row automatically — **no `cordis.patch.yml` edit needed**.

To try it without touching a profile, use an overlay:

```bash
dsh --profile web --patch ./dev.yml --host 127.0.0.1 --port 3099 --no-open
```

```yaml
# dev.yml
- insert:
    - id: video-preview
      name: '/absolute/path/to/dsh-video-preview/lib/index.js'
```

## Use

1. Type `@` in the composer and pick a video file (or open one from the workspace changes).
2. Click the file reference; the right sidebar opens a player and starts muted playback.
3. Drag, unmute, go fullscreen with the native controls.

## Limitations (host-side realities, not hidden defects)

| Limit | Cause | Workaround |
|---|---|---|
| Per-file size cap (32 MB by default) | Previews use a **complete-byte** read from `workspaceFiles`; `maxFileBytes` defaults to 32 MB | Raise `maxFileBytes` on the profile's `workspace-files` row |
| No `mkv` | Chrome cannot decode Matroska | Remux to mp4/webm |
| Codec-dependent | The browser only plays what the platform decodes; HEVC/AV1 vary | H.264/AAC mp4 is the safe choice |
| Whole file in memory | v0.1 skips Range streaming to stay host-free | Compress a preview copy for large files |

> The clean fix for size and streaming is a host-half route with authentication and Range support, letting `<video>` consume HTTP directly. v0.1 trades that for zero host dependencies.

## How it works

| Half | File | Role |
|---|---|---|
| Host | `lib/index.js` | Empty `apply`; exists so the plugin is visible to the Loader and the bundle, with no side effects under `dsh tui` / `dsh headless` |
| Browser | `lib/client.js` | Registers the dictionary → renderer metadata → keyed document body; renders `<video>` and owns the Blob URL lifetime |

The browser half needs no build step — it is a module in the host loader's own format:

```js
window.__ModuleLoader__.load({ id: "@lvxianchao/dsh-video-preview", factory: (require) => { /* … */ } });
```

The registration core:

```js
ctx.documentPreviews.register({
  id: VIDEO_BODY_ID,
  extensions: ["mp4", "m4v", "webm", "ogv", "ogg", "mov"],
  binaryExtensions: ["mp4", "m4v", "webm", "ogv", "ogg", "mov"],
  priority: "extension",
  title: () => t("title"),
  loading: "bytes-complete",
  wrap: false
});

ctx.slots.register({ name: "sidebar.right.tab.document", key: VIDEO_BODY_ID, locale: "sidebarVideo" }, VideoBody);
```

## Development

```bash
# shadow instance: isolated DSH_HOME, never touches the live profile or its data
DSH_HOME=/tmp/dsh-test-home dsh --profile web \
  --patch ./test/shadow.patch.yml --host 127.0.0.1 --port 3199 --no-open
```

`test/shadow.patch.yml` mounts the plugin by path; `test/e2e.mjs` drives headless Chrome through "@ reference → click → assert the `<video>` is playing".

## License

MIT
