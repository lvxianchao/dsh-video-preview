/**
 * dsh-video-preview — host half.
 *
 * Registers two authenticated Fetch routes on Connection, inside the same
 * browser-auth fence that guards every other /api route:
 *
 *   GET/HEAD /api/video-preview.stream?sessionId=…&path=…
 *     Byte-range streaming for <video>. Serves 206 responses with
 *     Content-Range, so the browser seeks without downloading the whole file.
 *     Each request reads at most `rangeBytes` (default 2 MB) through the
 *     workspaceFiles backend — no complete-file cap applies.
 *
 *   GET /api/video-preview.stat?sessionId=…&path=…
 *     Size, version and media type, so the renderer can report its loaded
 *     version and show a human-readable size line.
 *
 * The file authority is the platform's own: reads go through
 * `workspaceFiles.readBytes/stat` with the workspace scope resolved from the
 * session named in the query — exactly what the workspaceFiles RPC already
 * allows an authenticated browser to do. This route adds no new authority.
 *
 * The browser half ships via exports["./client"] and the package.json
 * `dsh.client` declaration; this module is inert under `dsh tui` / headless.
 */

/** Suffix to media type served by the stream route. */
const MEDIA_TYPES = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
}

const STREAM_PATH = '/api/video-preview.stream'
const STAT_PATH = '/api/video-preview.stat'

/** Required host services: the route fence, the file backend, and scope inputs. */
export const inject = ['connection', 'workspaceFiles', 'sessions', 'sandboxPolicy']

/** Stable plugin name, used by the harness Loader diagnostics. */
export const name = 'dsh-video-preview'

/** Default per-request byte window; bounded again by the workspaceFiles backend cap. */
const DEFAULT_RANGE_BYTES = 2 * 1024 * 1024

/** Lowercase suffix of a path, without the dot. */
function suffixOf(path) {
  const name = String(path ?? '').slice(Math.max(String(path ?? '').lastIndexOf('/'), String(path ?? '').lastIndexOf('\\')) + 1)
  const cut = name.lastIndexOf('.')
  return cut < 0 ? '' : name.slice(cut + 1).toLowerCase()
}

/** Media type for a path this renderer claims, or octet-stream for the rest. */
function mediaTypeOf(path) {
  return MEDIA_TYPES[suffixOf(path)] ?? 'application/octet-stream'
}

/** Query coordinates for both routes, or the 400 to answer with. */
function coordinates(request) {
  const query = new URL(request.url).searchParams
  const sessionId = query.get('sessionId')
  const path = query.get('path')
  if (typeof sessionId !== 'string' || sessionId === '' || typeof path !== 'string' || path === '') {
    return new Response('sessionId and path are required.', { status: 400 })
  }
  return { sessionId, path }
}

/**
 * Resolve the workspace scope for one session id: the live session header
 * first, then the persisted header, then give up.
 * @returns the scope, or undefined when no header names a workspace.
 */
async function scopeFor(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)?.header
  if (live !== undefined) return { sessionId, workspaceRoot: live.cwd ?? ctx.sandboxPolicy.workspaceRoot }
  let stored
  try {
    stored = await ctx.get('sessionPersistence')?.stat?.(sessionId)
  } catch {
    stored = undefined
  }
  const header = stored?.header
  if (header === undefined) return undefined
  return { sessionId, workspaceRoot: header.cwd ?? ctx.sandboxPolicy.workspaceRoot }
}

/**
 * Parse a byte Range header against a known size.
 * @returns null when no header was sent, `{offset,length}` for a satisfiable
 * range (length 0 means start past the end), or 'invalid' for a malformed one.
 */
function parseRange(raw, size) {
  if (raw === null || raw === undefined) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw.trim())
  if (match === null) return 'invalid'
  const [, from, to] = match
  if (from === '' && to === '') return 'invalid'
  if (from === '') {
    // suffix range: the last N bytes
    const n = Number(to)
    if (!Number.isSafeInteger(n) || n <= 0) return 'invalid'
    const offset = Math.max(0, size - n)
    return { offset, length: Math.min(n, size) }
  }
  const start = Number(from)
  if (!Number.isSafeInteger(start) || start < 0) return 'invalid'
  if (start >= size) return { offset: start, length: 0 }
  if (to === '') return { offset: start, length: size - start }
  const end = Number(to)
  if (!Number.isSafeInteger(end) || end < start) return 'invalid'
  return { offset: start, length: Math.min(end - start + 1, size - start) }
}

/** Map a workspaceFiles RemoteError to an HTTP status, or 500. */
function failure(error) {
  const code = typeof error === 'object' && error !== null ? error.code : undefined
  if (code === 'workspace-file/not-found') return new Response('Video file not found.', { status: 404 })
  if (code === 'gateway/bad-request' || code === 'workspace-file/not-regular-file') {
    return new Response('The named path is not a readable file.', { status: 400 })
  }
  if (error instanceof Error) console.error('[dsh-video-preview] stream failure:', error.message)
  return new Response('The video file is unavailable.', { status: 500 })
}

/** Per-request window: the plugin's `rangeBytes` config, defaulting to 2 MB. */
function rangeCap(config) {
  const configured = typeof config?.rangeBytes === 'number' && config.rangeBytes >= 1 ? config.rangeBytes : DEFAULT_RANGE_BYTES
  return Math.max(1, Math.floor(configured))
}

async function handleStat(ctx, request) {
  const params = coordinates(request)
  if (params instanceof Response) return params
  try {
    const scope = await scopeFor(ctx, params.sessionId)
    if (scope === undefined) return new Response('Session not found.', { status: 404 })
    const stat = await ctx.workspaceFiles.stat(scope, params.path, request.signal)
    return Response.json(
      { size: stat.bytes, version: stat.version, type: mediaTypeOf(params.path) },
      { headers: { 'cache-control': 'no-store' } }
    )
  } catch (error) {
    request.signal.throwIfAborted()
    return failure(error)
  }
}

async function handleStream(ctx, request, cap) {
  const params = coordinates(request)
  if (params instanceof Response) return params
  try {
    const scope = await scopeFor(ctx, params.sessionId)
    if (scope === undefined) return new Response('Session not found.', { status: 404 })
    const stat = await ctx.workspaceFiles.stat(scope, params.path, request.signal)
    const size = typeof stat.bytes === 'number' && stat.bytes >= 0 ? stat.bytes : 0
    const type = mediaTypeOf(params.path)
    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'content-type': type,
          'accept-ranges': 'bytes',
          'cache-control': 'no-store',
          'content-length': String(size),
        },
      })
    }
    const parsed = parseRange(request.headers.get('range'), size)
    if (parsed === 'invalid') {
      return new Response('Invalid byte range.', { status: 416, headers: { 'content-range': `bytes */${size}` } })
    }
    if (parsed !== null && parsed.length === 0) {
      return new Response('Byte range not satisfiable.', { status: 416, headers: { 'content-range': `bytes */${size}` } })
    }
    if (size === 0) {
      return new Response(null, {
        status: 200,
        headers: { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'content-length': '0' },
      })
    }
    const offset = parsed === null ? 0 : parsed.offset
    const requested = parsed === null ? size : parsed.length
    const length = Math.max(1, Math.min(requested, cap))
    const { data } = await ctx.workspaceFiles.readBytes(scope, params.path, { range: { offset, length } }, request.signal)
    const end = offset + data.length - 1
    return new Response(data, {
      status: parsed !== null ? 206 : 200,
      headers: {
        'content-type': type,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'content-length': String(data.length),
        'content-range': `bytes ${offset}-${end}/${size}`,
      },
    })
  } catch (error) {
    request.signal.throwIfAborted()
    return failure(error)
  }
}

/** Host plugin body: register both routes on the authenticated fetch fence. */
export function apply(ctx, config = {}) {
  const cap = rangeCap(config)
  ctx.connection.fetch.register({
    path: STREAM_PATH,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: (request) => handleStream(ctx, request, cap),
  })
  ctx.connection.fetch.register({
    path: STAT_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleStat(ctx, request),
  })
}
