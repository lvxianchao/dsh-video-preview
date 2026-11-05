/**
 * dsh-video-preview — browser half.
 *
 * Registered as a harness client module: `window.__ModuleLoader__.load(...)`.
 * Exports the cordis plugin body the client runtime evaluates.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis';

/** Dictionary namespace owned by this plugin (`sidebarVideo`). */
export declare const NS: 'sidebarVideo';

/** Renderer implementation id; also the keyed document-body slot key. */
export declare const VIDEO_BODY_ID: '@lvxianchao/dsh-video-preview/video';

/** Suffixes this renderer claims. */
export declare const VIDEO_EXTENSIONS: readonly ['mp4', 'm4v', 'webm', 'ogv', 'ogg', 'mov'];

/**
 * Host routes the renderer streams from (registered by the host half).
 * The client-side forms are document-relative, prefix-safe.
 */
export declare const STREAM_PATH: '/api/video-preview.stream';
export declare const STAT_PATH: '/api/video-preview.stat';

/** Required browser services. */
export declare const inject: readonly ['documentPreviews', 'slots', 'locale'];

/**
 * Client plugin body: registers dictionaries, the video renderer metadata
 * (`loading: "renderer"` — the body streams from the host route), and the
 * keyed document body.
 * @param ctx - client context carrying the preview registry, slots, and copy.
 */
export declare function apply(ctx: ClientContext): void;
