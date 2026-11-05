/**
 * dsh-video-preview — host half types.
 *
 * The feature is implemented in the host routes registered here and in the
 * browser half (`./client`).
 */

import type { Context as HostContext } from '@deepseek-ai/cordis';

/** Authenticated byte-range stream route (GET/HEAD). */
export declare const STREAM_PATH: '/api/video-preview.stream';

/** Authenticated metadata route (GET): size, version, media type. */
export declare const STAT_PATH: '/api/video-preview.stat';

/** Required host services: the route fence, the file backend, and scope inputs. */
export declare const inject: readonly ['connection', 'workspaceFiles', 'sessions', 'sandboxPolicy'];

/** Stable plugin name, used by the harness Loader diagnostics. */
export declare const name: 'dsh-video-preview';

/** Plugin config: `rangeBytes` caps one stream request's byte window (default 2 MiB). */
export interface VideoPreviewConfig {
  rangeBytes?: number;
}

/**
 * Host plugin body: register the stream and stat routes on Connection's
 * authenticated fetch fence.
 * @param ctx - host context carrying connection, workspaceFiles, sessions, sandboxPolicy.
 * @param config - plugin config from the profile patch (see VideoPreviewConfig).
 */
export declare function apply(ctx: HostContext, config?: VideoPreviewConfig): void;
