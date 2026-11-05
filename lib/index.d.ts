/**
 * dsh-video-preview — host half types.
 *
 * The feature is implemented in the browser half (`./client`); this half only
 * exists so the harness Loader mounts the package.
 */

/** Host plugin body — no host-side behavior for this rendering surface. */
export declare function apply(): void;

/** Stable plugin name, used by the harness Loader diagnostics. */
export declare const name: 'dsh-video-preview';
