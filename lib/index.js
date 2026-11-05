/**
 * dsh-video-preview — host half.
 *
 * The whole feature lives in the browser: `lib/client.js` registers a video
 * renderer into the sidebar's document-preview registry. This half is
 * intentionally empty, but a host entry must exist so the plugin appears in the
 * harness Loader; the browser half is then discovered from the package.json
 * `dsh.client` declaration and mounted into the Web UI.
 *
 * Free of side effects, it is also safe in a `dsh tui` or `dsh headless`
 * profile, where the browser half never runs.
 */

/** Host plugin body — no host-side behavior for this rendering surface. */
export function apply() {}

/** Stable plugin name, used by the harness Loader diagnostics. */
export const name = 'dsh-video-preview'
