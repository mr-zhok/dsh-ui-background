/**
 * Host half of the UI background plugin.
 *
 * Owns a small content-addressed image library under `$DSH_HOME/ui-background/`:
 *
 *   ui-background/
 *   ├─ images/<sha256>.<ext>
 *   ├─ index.json          [{ id, mime, ext, size, addedAt, name }]
 *   └─ state.json          { enabled, mode, opacity, overlayOpacity, currentId, updatedAt }
 *
 * Uploads append to the library (deduplicated by content), up to 10 images;
 * the background shows the selected `currentId`. A pre-1.3.0 single
 * `background.<ext>` is migrated into the library on first read.
 */
import { createHash } from 'node:crypto'
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PREFIX = '/ui-background'
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_JSON_BYTES = 8 * 1024
const MAX_THUMB_BYTES = 2 * 1024 * 1024
const MAX_ITEMS = 10
const THUMB_EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }
const THUMB_MIME = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' }
const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const EXT_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}
const ID_RE = /^[a-f0-9]{64}$/
const DEFAULT_STATE = {
  enabled: true,
  mode: 'wallpaper',
  opacity: 0.2,
  overlayOpacity: 0.25,
  dim: 0,
  rotateSeconds: 0,
  rotateOrder: 'sequential',
  shortcut: 'Alt+KeyC',
  currentId: null,
  updatedAt: 0,
}
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i

export const name = 'ui-background'
export const inject = ['webServer']

export function apply(ctx) {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const dir = join(home, 'ui-background')
  const imagesDir = join(dir, 'images')
  const thumbsDir = join(dir, 'thumbs')
  const indexPath = join(dir, 'index.json')
  const statePath = join(dir, 'state.json')

  function log(level, message) {
    try {
      const logger = typeof ctx.logger === 'function' ? ctx.logger('ui-background') : undefined
      if (logger && typeof logger[level] === 'function') logger[level](message)
    } catch {
      /* logging is never a reason to fail a request */
    }
  }

  function ensureDirs() {
    mkdirSync(imagesDir, { recursive: true })
    mkdirSync(thumbsDir, { recursive: true })
  }

  function readJson(file, fallback) {
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return fallback
    }
  }

  function writeJson(file, value) {
    ensureDirs()
    const temp = file + '.tmp'
    writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8')
    renameSync(temp, file)
  }

  function clampOpacity(value, fallback) {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback
  }

  function clampRotateSeconds(value) {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number) || number <= 0) return 0
    return Math.min(24 * 60 * 60, Math.max(10, Math.round(number)))
  }

  function imageFile(id, ext) {
    return join(imagesDir, id + '.' + ext)
  }

  function thumbFile(id, ext) {
    return join(thumbsDir, id + '.' + ext)
  }

  function findThumb(id) {
    for (const ext of Object.values(THUMB_EXT)) {
      const file = thumbFile(id, ext)
      if (existsSync(file)) return { file, mime: THUMB_MIME[ext] }
    }
    return null
  }

  function hasThumb(id) {
    return findThumb(id) !== null
  }

  function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex')
  }

  function normalizeItem(entry) {
    if (!entry || typeof entry !== 'object') return null
    if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) return null
    const mime = typeof entry.mime === 'string' && MIME_EXT[entry.mime]
      ? entry.mime
      : EXT_MIME[String(entry.ext || '').toLowerCase()]
    if (!mime) return null
    const ext = MIME_EXT[mime]
    const file = imageFile(entry.id, ext)
    if (!existsSync(file)) return null
    const size = typeof entry.size === 'number' && Number.isFinite(entry.size)
      ? entry.size
      : statSync(file).size
    const addedAt = typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt)
      ? entry.addedAt
      : 0
    const name = typeof entry.name === 'string' ? entry.name.slice(0, 80) : ''
    return { id: entry.id, mime, ext, size, addedAt, name }
  }

  function readIndex() {
    ensureDirs()
    if (existsSync(indexPath)) {
      const raw = readJson(indexPath, [])
      const items = []
      const seen = new Set()
      for (const entry of Array.isArray(raw) ? raw : []) {
        const item = normalizeItem(entry)
        if (!item || seen.has(item.id)) continue
        seen.add(item.id)
        items.push(item)
      }
      return items
    }
    return migrateLegacy()
  }

  /** Pre-1.3.0 stored a single `background.<ext>` next to the state file. */
  function migrateLegacy() {
    ensureDirs()
    for (const ext of Object.keys(EXT_MIME)) {
      const legacy = join(dir, 'background.' + ext)
      if (!existsSync(legacy)) continue
      const bytes = readFileSync(legacy)
      const mime = EXT_MIME[ext]
      const id = sha256(bytes)
      const target = imageFile(id, MIME_EXT[mime])
      if (!existsSync(target)) writeFileSync(target, bytes)
      rmSync(legacy, { force: true })
      const item = {
        id,
        mime,
        ext: MIME_EXT[mime],
        size: bytes.length,
        addedAt: Date.now(),
        name: 'background.' + ext,
      }
      writeJson(indexPath, [item])
      log('info', 'migrated the legacy background image into the library')
      return [item]
    }
    return []
  }

  function writeIndex(items) {
    writeJson(indexPath, items)
  }

  function readState(items) {
    const raw = readJson(statePath, null)
    const source = raw && typeof raw === 'object' ? raw : {}
    const state = {
      enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_STATE.enabled,
      mode: source.mode === 'overlay' ? 'overlay' : 'wallpaper',
      opacity: clampOpacity(source.opacity, DEFAULT_STATE.opacity),
      overlayOpacity: clampOpacity(source.overlayOpacity, DEFAULT_STATE.overlayOpacity),
      dim: clampOpacity(source.dim, DEFAULT_STATE.dim),
      rotateSeconds: clampRotateSeconds(source.rotateSeconds),
      rotateOrder: source.rotateOrder === 'random' ? 'random' : 'sequential',
      shortcut: typeof source.shortcut === 'string' ? source.shortcut.slice(0, 64) : DEFAULT_STATE.shortcut,
      currentId: typeof source.currentId === 'string' && items.some((item) => item.id === source.currentId)
        ? source.currentId
        : null,
      updatedAt: typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) ? source.updatedAt : 0,
    }
    if (state.currentId === null && items.length > 0) state.currentId = items[items.length - 1].id
    return state
  }

  function writeState(state) {
    writeJson(statePath, state)
  }

  function stateView(state, items, extra) {
    const current = items.find((item) => item.id === state.currentId) || null
    return Object.assign({
      enabled: state.enabled,
      mode: state.mode,
      opacity: state.opacity,
      overlayOpacity: state.overlayOpacity,
      dim: state.dim,
      rotateSeconds: state.rotateSeconds,
      rotateOrder: state.rotateOrder,
      shortcut: state.shortcut,
      currentId: state.currentId,
      updatedAt: state.updatedAt,
      hasImage: current !== null,
      mime: current ? current.mime : null,
      items: items.map((item) => ({
        id: item.id,
        mime: item.mime,
        size: item.size,
        addedAt: item.addedAt,
        name: item.name,
        thumb: hasThumb(item.id),
      })),
    }, extra || {})
  }

  function readView(extra) {
    const items = readIndex()
    const state = readState(items)
    return { items, state, view: stateView(state, items, extra) }
  }

  function sendJson(response, status, payload) {
    if (response.writableEnded) return
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    response.writeHead(status, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'content-length': body.length,
    })
    response.end(body)
  }

  async function readBody(request, maxBytes) {
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > maxBytes) {
        const error = new Error('request body too large')
        error.status = 413
        throw error
      }
      chunks.push(buffer)
    }
    return Buffer.concat(chunks)
  }

  /** The host's own request gate (login + origin fence), read per request. */
  function requestGate(request) {
    let connection
    try {
      connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
    } catch {
      connection = undefined
    }
    const gate = connection && connection.requestRejection
    if (typeof gate !== 'function') return undefined
    try {
      return gate.call(connection, request)
    } catch {
      return 403
    }
  }

  /**
   * Rebinding fence for mutating requests, used only when the host publishes
   * no connection gate. A missing Origin is accepted: the Desktop proxy
   * strips it and authenticates with a signed cookie instead.
   */
  function trustedRequest(request) {
    const host = request.headers.host
    if (host !== undefined && !LOOPBACK_HOST.test(host)) return false
    if (request.headers['sec-fetch-site'] === 'cross-site') return false
    const origin = request.headers.origin
    if (origin === undefined) return true
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }

  function imageName(header) {
    if (typeof header !== 'string' || header === '') return ''
    let name = header
    try {
      name = decodeURIComponent(header)
    } catch {
      name = header
    }
    return name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80)
  }

  function pickCurrent(items) {
    return items.length > 0 ? items[items.length - 1].id : null
  }

  /** Ids recorded in index.json, including entries whose files vanished. */
  function rawIndexIds() {
    const raw = readJson(indexPath, [])
    const ids = new Set()
    for (const entry of Array.isArray(raw) ? raw : []) {
      if (entry && typeof entry.id === 'string' && ID_RE.test(entry.id)) ids.add(entry.id)
    }
    return ids
  }

  /**
   * Scan `images/` and rebuild the index: hash every supported file, rename
   * non-canonical names to `<sha256>.<ext>`, drop duplicate content, keep the
   * newest MAX_ITEMS entries, and report what changed.
   */
  function scanLibrary(existing, rawIds) {
    ensureDirs()
    const prior = new Map(existing.map((item) => [item.id, item]))
    const found = new Map()
    let scanned = 0
    let ignored = 0
    let deduped = 0

    let entries = []
    try {
      entries = readdirSync(imagesDir, { withFileTypes: true })
    } catch {
      entries = []
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const name = entry.name
      if (name.startsWith('.') || name.endsWith('.tmp')) continue
      const dot = name.lastIndexOf('.')
      if (dot <= 0) {
        ignored += 1
        continue
      }
      const ext = name.slice(dot + 1).toLowerCase()
      const mime = EXT_MIME[ext]
      if (!mime) {
        ignored += 1
        continue
      }
      scanned += 1
      const full = join(imagesDir, name)
      let bytes
      try {
        bytes = readFileSync(full)
      } catch {
        ignored += 1
        continue
      }
      const id = sha256(bytes)
      const targetExt = MIME_EXT[mime]
      const target = imageFile(id, targetExt)
      if (name !== id + '.' + targetExt) {
        if (existsSync(target)) {
          // The same bytes are already stored under the canonical name.
          rmSync(full, { force: true })
          deduped += 1
        } else {
          try {
            renameSync(full, target)
          } catch {
            ignored += 1
            continue
          }
        }
      }
      if (found.has(id)) {
        deduped += 1
        continue
      }
      const previous = prior.get(id)
      found.set(id, {
        id,
        mime,
        ext: targetExt,
        size: bytes.length,
        addedAt: previous ? previous.addedAt : Date.now(),
        name: previous ? previous.name : name,
      })
    }

    const ordered = []
    const seen = new Set()
    for (const item of existing) {
      const fresh = found.get(item.id)
      if (!fresh) continue
      ordered.push(fresh)
      seen.add(item.id)
    }
    const newcomers = [...found.values()]
      .filter((item) => !seen.has(item.id))
      .sort((a, b) => a.addedAt - b.addedAt)
    ordered.push(...newcomers)

    let items = ordered
    let overflow = 0
    if (items.length > MAX_ITEMS) {
      overflow = items.length - MAX_ITEMS
      const keep = new Set(
        [...items].sort((a, b) => b.addedAt - a.addedAt).slice(0, MAX_ITEMS).map((item) => item.id),
      )
      items = items.filter((item) => keep.has(item.id))
    }

    const keptIds = new Set(items.map((item) => item.id))
    const added = items.filter((item) => !rawIds.has(item.id)).length
    const removed = [...rawIds].filter((id) => !keptIds.has(id)).length
    return {
      items,
      report: { scanned, added, removed, deduped, ignored, overflow, total: items.length },
    }
  }

  /** Drop thumbnails whose image is no longer part of the library. */
  function pruneThumbFiles(items) {
    const ids = new Set(items.map((item) => item.id))
    try {
      for (const name of readdirSync(thumbsDir)) {
        const dot = name.lastIndexOf('.')
        if (dot <= 0) continue
        const id = name.slice(0, dot)
        if (!ids.has(id)) rmSync(join(thumbsDir, name), { force: true })
      }
    } catch {
      /* no thumbs directory yet */
    }
  }

  function rescan() {
    const rawIds = rawIndexIds()
    const existing = readIndex()
    const { items, report } = scanLibrary(existing, rawIds)
    pruneThumbFiles(items)
    const state = readState(items)
    state.updatedAt = Date.now()
    writeIndex(items)
    writeState(state)
    log('info', `rescan: ${report.scanned} scanned, ${report.added} added, ${report.removed} removed`)
    return stateView(state, items, { rescan: report })
  }

  function serveImage(response, item) {
    const file = imageFile(item.id, item.ext)
    if (!existsSync(file)) {
      sendJson(response, 404, { error: 'no background image' })
      return
    }
    const data = readFileSync(file)
    response.writeHead(200, {
      // Content-addressed: the bytes behind an id never change.
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': item.mime,
      'content-length': data.length,
    })
    response.end(data)
  }

  /**
   * Mutation lock: serialize the read-modify-write sections of mutating
   * routes so concurrent uploads/deletes/rescans cannot lose an index or
   * state update. Request bodies are read outside the lock.
   */
  let mutationChain = Promise.resolve()
  function withMutationLock(work) {
    const run = mutationChain.then(work)
    mutationChain = run.then(() => undefined, () => undefined)
    return run
  }

  async function handle(request, response) {
    const rejection = requestGate(request)
    if (typeof rejection === 'number' && rejection !== 0) {
      sendJson(response, rejection, {
        error: rejection === 401 ? '需要先登录 DSH / login required' : '请求被拒绝 / forbidden',
      })
      return
    }

    const method = String(request.method || 'GET').toUpperCase()
    const url = new URL(String(request.url || '/'), 'http://127.0.0.1')
    const route = url.pathname.slice(PREFIX.length) || '/'

    if (method === 'GET' && route === '/state') {
      sendJson(response, 200, readView().view)
      return
    }

    if (method === 'GET' && route === '/image') {
      const items = readIndex()
      const state = readState(items)
      const requested = url.searchParams.get('id')
      const targetId = requested || state.currentId
      if (!targetId) {
        sendJson(response, 404, { error: 'no background image' })
        return
      }
      if (!ID_RE.test(targetId)) {
        sendJson(response, 404, { error: 'no background image' })
        return
      }
      const item = items.find((entry) => entry.id === targetId)
      if (!item) {
        sendJson(response, 404, { error: 'no background image' })
        return
      }
      serveImage(response, item)
      return
    }

    if (method === 'GET' && route === '/thumb') {
      const id = url.searchParams.get('id')
      if (!id || !ID_RE.test(id)) {
        sendJson(response, 404, { error: 'no thumbnail' })
        return
      }
      const items = readIndex()
      if (!items.some((item) => item.id === id)) {
        sendJson(response, 404, { error: 'no thumbnail' })
        return
      }
      const thumb = findThumb(id)
      if (!thumb) {
        sendJson(response, 404, { error: 'no thumbnail' })
        return
      }
      const data = readFileSync(thumb.file)
      response.writeHead(200, {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': thumb.mime,
        'content-length': data.length,
      })
      response.end(data)
      return
    }

    if (method !== 'GET' && !trustedRequest(request)) {
      sendJson(response, 403, { error: 'untrusted request' })
      return
    }

    if (method === 'POST' && route === '/image') {
      const mime = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
      if (!MIME_EXT[mime]) {
        sendJson(response, 415, { error: 'unsupported image type' })
        return
      }
      const bytes = await readBody(request, MAX_IMAGE_BYTES)
      if (bytes.length === 0) {
        sendJson(response, 400, { error: 'empty image' })
        return
      }

      const id = sha256(bytes)

      await withMutationLock(() => {
        const items = readIndex()
        const state = readState(items)
        const existing = items.find((item) => item.id === id)

        if (existing) {
          // Same bytes are already in the library: select, never duplicate.
          state.currentId = existing.id
          state.updatedAt = Date.now()
          writeState(state)
          sendJson(response, 200, stateView(state, items, { duplicate: true }))
          return
        }

        if (items.length >= MAX_ITEMS) {
          sendJson(response, 409, { error: 'limit-reached', limit: MAX_ITEMS })
          return
        }

        const ext = MIME_EXT[mime]
        const file = imageFile(id, ext)
        const temp = file + '.tmp'
        ensureDirs()
        writeFileSync(temp, bytes)
        renameSync(temp, file)

        const item = {
          id,
          mime,
          ext,
          size: bytes.length,
          addedAt: Date.now(),
          name: imageName(request.headers['x-image-name']),
        }
        const nextItems = items.concat(item)
        state.currentId = id
        state.updatedAt = Date.now()
        writeIndex(nextItems)
        writeState(state)
        log('info', `added background image ${id.slice(0, 12)}… (${mime}, ${bytes.length} bytes)`)
        sendJson(response, 200, stateView(state, nextItems))
      })
      return
    }

    if (method === 'POST' && route === '/thumbnail') {
      const id = url.searchParams.get('id')
      if (!id || !ID_RE.test(id)) {
        sendJson(response, 400, { error: 'invalid id' })
        return
      }
      const mime = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
      const ext = THUMB_EXT[mime]
      if (!ext) {
        sendJson(response, 415, { error: 'unsupported thumbnail type' })
        return
      }
      const bytes = await readBody(request, MAX_THUMB_BYTES)
      if (bytes.length === 0) {
        sendJson(response, 400, { error: 'empty thumbnail' })
        return
      }
      await withMutationLock(() => {
        const items = readIndex()
        if (!items.some((item) => item.id === id)) {
          sendJson(response, 404, { error: 'no background image' })
          return
        }
        ensureDirs()
        const file = thumbFile(id, ext)
        const temp = file + '.tmp'
        writeFileSync(temp, bytes)
        renameSync(temp, file)
        for (const other of Object.values(THUMB_EXT)) {
          if (other !== ext) rmSync(thumbFile(id, other), { force: true })
        }
        sendJson(response, 200, { ok: true })
      })
      return
    }

    if (method === 'POST' && route === '/rescan') {
      const view = await withMutationLock(() => rescan())
      sendJson(response, 200, view)
      return
    }

    if (method === 'DELETE' && route.startsWith('/image/')) {
      await withMutationLock(() => {
        const items = readIndex()
        const state = readState(items)
        let id = null
        try {
          id = decodeURIComponent(route.slice('/image/'.length))
        } catch {
          id = null
        }
        const item = id ? items.find((entry) => entry.id === id) : null
        if (!item) {
          sendJson(response, 404, { error: 'no background image' })
          return
        }
        const wasCurrent = state.currentId === item.id
        rmSync(imageFile(item.id, item.ext), { force: true })
        for (const ext of Object.values(THUMB_EXT)) rmSync(thumbFile(item.id, ext), { force: true })
        const remaining = items.filter((entry) => entry.id !== item.id)
        writeIndex(remaining)
        if (wasCurrent || !remaining.some((entry) => entry.id === state.currentId)) {
          state.currentId = pickCurrent(remaining)
          state.updatedAt = Date.now()
        }
        writeState(state)
        log('info', `removed background image ${item.id.slice(0, 12)}…`)
        sendJson(response, 200, stateView(state, remaining))
      })
      return
    }

    if (method === 'PATCH' && route === '/state') {
      let body
      try {
        body = JSON.parse((await readBody(request, MAX_JSON_BYTES)).toString('utf8') || '{}')
      } catch {
        sendJson(response, 400, { error: 'invalid json' })
        return
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        sendJson(response, 400, { error: 'invalid json' })
        return
      }
      await withMutationLock(() => {
        const items = readIndex()
        const state = readState(items)
        if (typeof body.enabled === 'boolean') state.enabled = body.enabled
        if (body.mode === 'wallpaper' || body.mode === 'overlay') state.mode = body.mode
        if (body.opacity !== undefined) state.opacity = clampOpacity(body.opacity, DEFAULT_STATE.opacity)
        if (body.overlayOpacity !== undefined) {
          state.overlayOpacity = clampOpacity(body.overlayOpacity, DEFAULT_STATE.overlayOpacity)
        }
        if (body.dim !== undefined) {
          state.dim = clampOpacity(body.dim, DEFAULT_STATE.dim)
        }
        if (body.rotateSeconds !== undefined) {
          state.rotateSeconds = clampRotateSeconds(body.rotateSeconds)
        }
        if (body.rotateOrder === 'random' || body.rotateOrder === 'sequential') {
          state.rotateOrder = body.rotateOrder
        }
        if (typeof body.shortcut === 'string') {
          // Canonical "Ctrl+Alt+Shift+Meta+event.code" or "" (disabled).
          state.shortcut = body.shortcut.slice(0, 64)
        }
        if (typeof body.currentId === 'string' && body.currentId !== state.currentId
          && items.some((item) => item.id === body.currentId)) {
          state.currentId = body.currentId
          state.updatedAt = Date.now()
        }
        writeState(state)
        sendJson(response, 200, stateView(state, items))
      })
      return
    }

    if (method === 'POST' && route === '/reorder') {
      let body
      try {
        body = JSON.parse((await readBody(request, MAX_JSON_BYTES)).toString('utf8') || '{}')
      } catch {
        sendJson(response, 400, { error: 'invalid json' })
        return
      }
      const ids = body && Array.isArray(body.ids) ? body.ids : null
      if (!ids) {
        sendJson(response, 400, { error: 'invalid order' })
        return
      }
      await withMutationLock(() => {
        const items = readIndex()
        if (ids.length !== items.length) {
          sendJson(response, 400, { error: 'invalid order' })
          return
        }
        const byId = new Map(items.map((item) => [item.id, item]))
        const next = []
        const seen = new Set()
        for (const id of ids) {
          if (typeof id !== 'string' || !byId.has(id) || seen.has(id)) {
            sendJson(response, 400, { error: 'invalid order' })
            return
          }
          seen.add(id)
          next.push(byId.get(id))
        }
        writeIndex(next)
        const state = readState(next)
        state.updatedAt = Date.now()
        writeState(state)
        sendJson(response, 200, stateView(state, next))
      })
      return
    }

    sendJson(response, 404, { error: 'not found' })
  }

  function onRequest(request, response) {
    Promise.resolve(handle(request, response)).catch((error) => {
      const status = typeof error?.status === 'number' ? error.status : 500
      const message = status === 413 ? 'image too large' : status === 400 ? 'bad request' : 'internal error'
      if (!response.headersSent) {
        sendJson(response, status, { error: message })
      } else if (!response.writableEnded) {
        try {
          response.end()
        } catch {
          /* socket already gone */
        }
      }
      if (status === 500) log('error', (error && error.stack) || String(error))
    })
  }

  const dispose = ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler: onRequest })
  ctx.effect(() => () => {
    try {
      dispose()
    } catch (error) {
      log('warn', 'route disposal failed: ' + String(error))
    }
  })
}
