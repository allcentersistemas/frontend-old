import { sessionClientHeaders } from '../auth/clientSession'
import { isAccessTokenExpired } from '../auth/jwtUtils'
import { saveAuthTokens } from '../auth/tokenStorage'
import { biesseApiBase, systemApiBase } from '../config/env'

const RM_MEDIA_MARKER = '/api/rm/media/'
const AUTH_SYNC_CHANNEL = 'appscanner-auth'
const REFRESH_LOCK = 'appscanner-auth-refresh'

let tokens = null
const listeners = []
let refreshInFlight = null
let authBroadcast = null

function authChannel() {
  if (typeof BroadcastChannel === 'undefined') {
    return null
  }
  if (authBroadcast) {
    return authBroadcast
  }
  authBroadcast = new BroadcastChannel(AUTH_SYNC_CHANNEL)
  authBroadcast.onmessage = (ev) => {
    if (ev.data?.type === 'tokens-updated' && ev.data.tokens?.accessToken && ev.data.tokens?.refreshToken) {
      tokens = ev.data.tokens
      for (const l of listeners) {
        l(tokens)
      }
    }
  }
  return authBroadcast
}

function publishTokens(next) {
  setStoredTokens(next)
  saveAuthTokens(next)
  authChannel()?.postMessage({ type: 'tokens-updated', tokens: next })
}

let systemExtraHeadersFn = () => ({})

export function getStoredTokens() {
  return tokens
}

export function setStoredTokens(next) {
  tokens = next
  for (const l of listeners) {
    l(next)
  }
}

export function subscribeTokens(listener) {
  listeners.push(listener)
  return () => {
    const i = listeners.indexOf(listener)
    if (i >= 0) listeners.splice(i, 1)
  }
}

let refreshFn = null

export function configureTokenRefresh(fn) {
  refreshFn = fn
}

/** Registra cabeceras extra en llamadas a module-system (auditoría, actor, etc.). */
export function configureSystemExtraHeaders(getter) {
  systemExtraHeadersFn = typeof getter === 'function' ? getter : () => ({})
}

/** @deprecated Usar configureSystemExtraHeaders */
export const configureTransportExtraHeaders = configureSystemExtraHeaders
/** @deprecated Usar configureSystemExtraHeaders */
export const configureRmExtraHeaders = configureSystemExtraHeaders
/** @deprecated Usar configureSystemExtraHeaders */
export const configureInventoryExtraHeaders = configureSystemExtraHeaders

function collectSystemExtraHeaders() {
  const extra = systemExtraHeadersFn()
  if (!extra || typeof extra !== 'object') return {}
  const merged = {}
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && String(v).trim() !== '') {
      merged[k] = String(v).trim()
    }
  }
  return merged
}

async function runRefreshOnce() {
  if (!refreshFn) return false
  const session = await refreshFn()
  if (!session?.accessToken || !session?.refreshToken) return false
  publishTokens({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  })
  return true
}

async function tryRefresh() {
  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = (async () => {
    if (navigator.locks?.request) {
      return navigator.locks.request(REFRESH_LOCK, runRefreshOnce)
    }
    return runRefreshOnce()
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

async function parseJson(text) {
  if (!text) {
    throw new SyntaxError('empty body')
  }
  return JSON.parse(text)
}

function isNoContent(res) {
  return res.status === 204 || res.status === 205
}

function formatErrorPayload(payload) {
  if (payload == null || typeof payload !== 'object') {
    return null
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim()
  }
  if (payload.details && typeof payload.details === 'object') {
    const pairs = Object.entries(payload.details).filter(([, v]) => v != null)
    if (pairs.length > 0) {
      return pairs.map(([k, v]) => `${k}: ${v}`).join('; ')
    }
  }
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim()
  }
  return null
}

async function readErrorDetail(res) {
  const fallback = res.statusText || `HTTP ${res.status}`
  const text = await res.text().catch(() => '')
  if (!text) return fallback
  try {
    const payload = JSON.parse(text)
    return (formatErrorPayload(payload) ?? text.trim()) || fallback
  } catch {
    return text.trim() || fallback
  }
}

/**
 * `init` puede incluir `skipAuth: true` para llamadas públicas (login, refresh…).
 */
async function backendJson(apiBase, path, init, { mergeSystemHeaders = false } = {}) {
  const { skipAuth, ...rest } = init ?? {}
  const headers = new Headers(rest.headers)
  if (!headers.has('Content-Type') && rest.body && !(rest.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (mergeSystemHeaders) {
    for (const [k, v] of Object.entries(collectSystemExtraHeaders())) {
      headers.set(k, v)
    }
    for (const [k, v] of Object.entries(sessionClientHeaders())) {
      headers.set(k, v)
    }
  }
  if (!skipAuth) {
    const t = getStoredTokens()
    if (t?.accessToken && isAccessTokenExpired(t.accessToken) && t.refreshToken) {
      await tryRefresh()
    }
    const tAfter = getStoredTokens()
    if (tAfter?.accessToken) {
      headers.set('Authorization', `Bearer ${tAfter.accessToken}`)
    }
  }
  const url = `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`
  const fetchInit = {
    ...rest,
    headers,
    credentials: 'omit',
    referrerPolicy: 'strict-origin-when-cross-origin',
    cache: rest.cache ?? 'no-store',
  }
  let res = await fetch(url, fetchInit)

  if (res.status === 401 && !skipAuth && getStoredTokens()?.refreshToken) {
    const ok = await tryRefresh()
    if (ok) {
      const t2 = getStoredTokens()
      if (t2?.accessToken) {
        headers.set('Authorization', `Bearer ${t2.accessToken}`)
      }
      res = await fetch(url, { ...fetchInit, headers })
    }
  }

  if (!res.ok) {
    const detail = await readErrorDetail(res)
    throw new Error(detail || `HTTP ${res.status}`)
  }

  const text = await res.text()
  if (isNoContent(res)) {
    return undefined
  }
  return parseJson(text)
}

/** module-system (monolito) */
export async function systemJson(path, init) {
  return backendJson(systemApiBase, path, init, { mergeSystemHeaders: true })
}

/**
 * Subida multipart con progreso (0–100). Usa XHR porque fetch no expone upload progress.
 * @param {string} path
 * @param {FormData} formData
 * @param {{ onProgress?: (pct: number) => void, signal?: AbortSignal }} [opts]
 */
export function systemUploadWithProgress(path, formData, opts = {}) {
  const { onProgress, signal } = opts
  const url = `${systemApiBase}${path.startsWith('/') ? '' : '/'}${path}`

  return new Promise(async (resolve, reject) => {
    try {
      const t = getStoredTokens()
      if (t?.accessToken && isAccessTokenExpired(t.accessToken) && t.refreshToken) {
        await tryRefresh()
      }
    } catch (err) {
      reject(err)
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'text'
    xhr.withCredentials = false

    const headers = new Headers()
    for (const [k, v] of Object.entries(collectSystemExtraHeaders())) {
      headers.set(k, v)
    }
    for (const [k, v] of Object.entries(sessionClientHeaders())) {
      headers.set(k, v)
    }
    const token = getStoredTokens()?.accessToken
    if (token) headers.set('Authorization', `Bearer ${token}`)
    headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value)
    })

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener(
        'abort',
        () => {
          xhr.abort()
          reject(new DOMException('Aborted', 'AbortError'))
        },
        { once: true },
      )
    }

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) {
        onProgress?.(0)
        return
      }
      const pct = Math.max(0, Math.min(100, Math.round((ev.loaded / ev.total) * 100)))
      onProgress?.(pct)
    }
    xhr.upload.onload = () => onProgress?.(100)

    xhr.onload = () => {
      const text = xhr.responseText || ''
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!text) {
          resolve(null)
          return
        }
        try {
          resolve(JSON.parse(text))
        } catch {
          resolve(text)
        }
        return
      }
      let message = `HTTP ${xhr.status}`
      try {
        const payload = text ? JSON.parse(text) : null
        message = formatErrorPayload(payload) || text || message
      } catch {
        if (text && text.length < 280) message = text
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Error de red al subir el archivo'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    xhr.send(formData)
  })
}

/** module-biesse (escaneo OSI) */
export async function biesseJson(path, init) {
  return backendJson(biesseApiBase, path, init)
}

export async function refreshStoredSession() {
  if (!getStoredTokens()?.refreshToken) {
    return null
  }
  const ok = await tryRefresh()
  if (!ok) {
    return null
  }
  const t = getStoredTokens()
  if (!t?.accessToken || !t?.refreshToken) {
    return null
  }
  return { accessToken: t.accessToken, refreshToken: t.refreshToken }
}

export async function refreshSessionRequest(body) {
  return systemJson('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
    headers: sessionClientHeaders(),
  })
}

/**
 * Las URLs de fotos RM del API pueden venir sin el prefijo del proxy (/api-system).
 * Normaliza a la base que usa el frontend (misma que systemJson).
 */
export function resolveRmMediaUrl(apiUrl) {
  if (!apiUrl || typeof apiUrl !== 'string') return null
  const trimmed = apiUrl.trim()
  if (!trimmed) return null

  const apiRoot =
    systemApiBase.startsWith('http://') || systemApiBase.startsWith('https://')
      ? systemApiBase.replace(/\/+$/, '')
      : `${window.location.origin}${systemApiBase.startsWith('/') ? systemApiBase : `/${systemApiBase}`}`.replace(
          /\/+$/,
          '',
        )

  if (trimmed.startsWith(RM_MEDIA_MARKER)) {
    return `${apiRoot}${trimmed}`
  }

  try {
    const parsed = new URL(trimmed, window.location.origin)
    const idx = parsed.pathname.indexOf(RM_MEDIA_MARKER)
    if (idx >= 0) {
      const mediaPath = parsed.pathname.slice(idx)
      return `${apiRoot}${mediaPath}${parsed.search}`
    }
  } catch {
    if (trimmed.includes(RM_MEDIA_MARKER)) {
      const idx = trimmed.indexOf(RM_MEDIA_MARKER)
      return `${apiRoot}${trimmed.slice(idx)}`
    }
  }

  return null
}

/** Descarga binaria de fotos RM con JWT (img src directo no envía Authorization). */
export async function fetchSystemMediaBlob(mediaUrl) {
  const url = resolveRmMediaUrl(mediaUrl)
  if (!url) throw new Error('URL de media inválida')

  const headers = new Headers()
  for (const [k, v] of Object.entries(collectSystemExtraHeaders())) {
    headers.set(k, v)
  }
  let t = getStoredTokens()
  if (t?.accessToken && isAccessTokenExpired(t.accessToken) && t.refreshToken) {
    await tryRefresh()
    t = getStoredTokens()
  }
  if (t?.accessToken) {
    headers.set('Authorization', `Bearer ${t.accessToken}`)
  }

  let res = await fetch(url, { headers, credentials: 'omit' })
  if (res.status === 401 && t?.refreshToken) {
    const ok = await tryRefresh()
    if (ok) {
      const t2 = getStoredTokens()
      if (t2?.accessToken) {
        headers.set('Authorization', `Bearer ${t2.accessToken}`)
      }
      res = await fetch(url, { headers, credentials: 'omit' })
    }
  }

  if (!res.ok) {
    const detail = await readErrorDetail(res)
    throw new Error(detail || `HTTP ${res.status}`)
  }
  return res.blob()
}

export async function biessePingText() {
  const t = getStoredTokens()
  const headers = new Headers()
  if (t?.accessToken) {
    headers.set('Authorization', `Bearer ${t.accessToken}`)
  }
  const url = `${biesseApiBase}/api/biesse/scan/stats/general`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(res.statusText || `HTTP ${res.status}`)
  const payload = await res.json()
  return JSON.stringify(payload, null, 2)
}

/**
 * Lee un stream SSE (text/event-stream) con JWT en Authorization.
 * Invoca onEvent({ event, data }) por cada evento; data es JSON parseado cuando aplica.
 */
export async function systemEventStream(path, { onEvent, signal, mergeSystemHeaders = true } = {}) {
  const buildHeaders = () => {
    const headers = new Headers({ Accept: 'text/event-stream' })
    if (mergeSystemHeaders) {
      for (const [k, v] of Object.entries(collectSystemExtraHeaders())) {
        headers.set(k, v)
      }
    }
    let t = getStoredTokens()
    if (t?.accessToken && isAccessTokenExpired(t.accessToken) && t.refreshToken) {
      // refresh sync not awaited here; caller reconnects on failure
    }
    t = getStoredTokens()
    if (t?.accessToken) {
      headers.set('Authorization', `Bearer ${t.accessToken}`)
    }
    return headers
  }

  const url = `${systemApiBase}${path.startsWith('/') ? '' : '/'}${path}`
  let res = await fetch(url, { headers: buildHeaders(), credentials: 'omit', signal })
  if (res.status === 401 && getStoredTokens()?.refreshToken) {
    const ok = await tryRefresh()
    if (ok) {
      res = await fetch(url, { headers: buildHeaders(), credentials: 'omit', signal })
    }
  }
  if (!res.ok) {
    const detail = await readErrorDetail(res)
    throw new Error(detail || `HTTP ${res.status}`)
  }
  if (!res.body) {
    throw new Error('Stream no disponible')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatchBlock = (block) => {
    const lines = block.split('\n')
    let eventName = 'message'
    const dataLines = []
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }
    if (dataLines.length === 0) {
      return
    }
    const raw = dataLines.join('\n')
    let data = raw
    try {
      data = JSON.parse(raw)
    } catch {
      /* plain text */
    }
    onEvent?.({ event: eventName, data })
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let splitAt
    while ((splitAt = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, splitAt).trim()
      buffer = buffer.slice(splitAt + 2)
      if (block) dispatchBlock(block)
    }
  }
}
