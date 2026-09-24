import { sessionClientHeaders } from '../auth/clientSession'
import { systemApiBase } from '../config/env'
import { getStoredTokens, systemDownloadBlob, systemEventStream, systemJson, systemUploadWithProgress } from './http'

/* ——— Auth ——— */

export async function login(body) {
  return systemJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
    headers: sessionClientHeaders(),
  })
}

export async function firstSetupStatus() {
  return systemJson('/api/auth/first-setup/status', { skipAuth: true })
}

export async function completeFirstSetup(body, options = {}) {
  const headers = {}
  if (options.setupSecret != null && String(options.setupSecret).trim() !== '') {
    headers['X-First-Setup-Secret'] = String(options.setupSecret).trim()
  }
  return systemJson('/api/auth/first-setup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: Object.keys(headers).length ? headers : undefined,
    skipAuth: true,
  })
}

export async function register(body) {
  return systemJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  })
}

export async function refreshSession(body) {
  return systemJson('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  })
}

export async function logout(body) {
  await systemJson('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  })
}

export async function logoutAll() {
  await systemJson('/api/auth/logout-all', { method: 'POST' })
}

export async function fetchMe() {
  return systemJson('/api/auth/me')
}

export async function changePassword(body) {
  await systemJson('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function fetchApiCatalog() {
  return systemJson('/api', { skipAuth: true })
}

/* ——— Empleados / roles ——— */

export async function patchMyProfile(body) {
  return systemJson('/api/employees/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function fetchMeAsEmployee() {
  return systemJson('/api/employees/me')
}

export async function listEmployees(params = {}) {
  const q = new URLSearchParams()
  if (params.activeOnly === false) {
    q.set('activeOnly', 'false')
  } else {
    q.set('activeOnly', 'true')
  }
  if (params.q != null && String(params.q).trim() !== '') {
    q.set('q', String(params.q).trim())
  }
  const suffix = q.toString() ? `?${q}` : ''
  return systemJson(`/api/employees${suffix}`)
}

/** Empleados activos con un rol concreto (p. ej. VENTAS), para desplegables. */
export async function listEmployeesCatalogByRole(roleName) {
  return systemJson(`/api/employees/catalog/by-role/${encodeURIComponent(roleName)}`)
}

export async function resetEmployeePassword(employeeId, body) {
  await systemJson(`/api/employees/${employeeId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getEmployeeById(employeeId) {
  return systemJson(`/api/employees/${employeeId}`)
}

export async function createEmployee(body) {
  return systemJson('/api/employees', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function patchEmployee(employeeId, body) {
  return systemJson(`/api/employees/${employeeId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function replaceEmployeeRoles(employeeId, roleIds) {
  return systemJson(`/api/employees/${employeeId}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roleIds }),
  })
}

export async function deleteEmployee(employeeId) {
  await systemJson(`/api/employees/${employeeId}`, { method: 'DELETE' })
}

export async function recordStickerPrint(body) {
  return systemJson('/api/impresion/sticker', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listStickerPrints(params = {}) {
  const q = new URLSearchParams()
  if (params.orderId != null) q.set('orderId', String(params.orderId))
  if (params.fromDate) q.set('fromDate', String(params.fromDate))
  if (params.toDate) q.set('toDate', String(params.toDate))
  q.set('limit', String(params.limit ?? 100))
  const list = await systemJson(`/api/impresion/sticker?${q}`)
  return list
}

export async function listRoles() {
  return systemJson('/api/roles')
}

export async function getRoleById(roleId) {
  return systemJson(`/api/roles/${roleId}`)
}

export async function createRole(body) {
  return systemJson('/api/roles', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function patchRole(roleId, body) {
  return systemJson(`/api/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteRole(roleId) {
  await systemJson(`/api/roles/${roleId}`, { method: 'DELETE' })
}

/* ——— Auditoría empleados ——— */

export async function auditEntries(pageOrOpts = 0, size) {
  const opts =
    typeof pageOrOpts === 'object' && pageOrOpts !== null && !Array.isArray(pageOrOpts)
      ? pageOrOpts
      : { page: pageOrOpts, size }
  const q = new URLSearchParams()
  q.set('page', String(opts.page ?? 0))
  q.set('size', String(opts.size ?? 50))
  if (opts.sort != null && String(opts.sort).trim() !== '') {
    q.append('sort', String(opts.sort).trim())
  }
  if (opts.entityType != null && String(opts.entityType).trim() !== '') {
    q.set('entityType', String(opts.entityType).trim())
  }
  if (opts.entityId != null && String(opts.entityId).trim() !== '') {
    q.set('entityId', String(opts.entityId).trim())
  }
  return systemJson(`/api/audit/entries?${q}`)
}

export async function listAuditEmployeeDirectory() {
  return systemJson('/api/employees/audit-directory')
}

export async function getAuditEntryById(id) {
  return systemJson(`/api/audit/entries/${id}`)
}

/* ——— Ubicaciones ——— */

export async function listBranches() {
  return systemJson('/api/location/branches')
}

export async function createBranch(body) {
  return systemJson('/api/location/branch', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listLocations() {
  return systemJson('/api/location/locations')
}

export async function createLocation(body) {
  return systemJson('/api/location/location', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/* ——— Proyecto optimización ——— */

export async function listProyectosOptimizacion(params = {}) {
  const q = new URLSearchParams()
  if (params.scope) q.set('scope', params.scope)
  if (params.estado) q.set('estado', params.estado)
  if (params.nombre) q.set('nombre', params.nombre)
  if (params.cliente) q.set('cliente', params.cliente)
  if (params.vendedor) q.set('vendedor', params.vendedor)
  if (params.fechaDesde) q.set('fechaDesde', params.fechaDesde)
  if (params.fechaHasta) q.set('fechaHasta', params.fechaHasta)
  const suffix = q.toString() ? `?${q}` : ''
  return systemJson(`/api/order/proyectos${suffix}`)
}

export async function getProyectoOptimizacion(id) {
  return systemJson(`/api/order/proyectos/${id}`)
}

export async function getProyectoPortalCliente(proyectoId) {
  return systemJson(`/api/order/proyectos/${proyectoId}/cliente`)
}

export async function deleteProyectoOptimizacion(id) {
  return systemJson(`/api/order/proyectos/${id}`, { method: 'DELETE' })
}

export async function capturarProyectoOptimizacion(id) {
  return systemJson(`/api/order/proyectos/${id}/capturar`, { method: 'POST' })
}

export async function updateProyectoEstado(id, estado) {
  return systemJson(`/api/order/proyectos/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  })
}

export async function markProyectoVendido(id) {
  return systemJson(`/api/order/proyectos/${id}/vendido`, { method: 'POST' })
}

export async function listProyectosSeguimiento() {
  return systemJson('/api/order/proyectos/seguimiento')
}

/** Fecha de inicio del tablero Seguimiento (Configuración). */
export async function fetchSeguimientoConfig() {
  return systemJson('/api/order/seguimiento/config')
}

/** Tablero Seguimiento: proyectos con órdenes/XML (estado proyecto = cuello de botella). */
export async function listSeguimientoProyectosBoard() {
  return systemJson('/api/order/proyectos/seguimiento/board')
}

/** Tablero Seguimiento por XML/obra Biesse (`estado_escaneo`). @param {{ since?: string }} */
export async function listObrasSeguimiento({ since } = {}) {
  const q = new URLSearchParams()
  if (since) q.set('since', String(since).trim())
  const suffix = q.toString() ? `?${q}` : ''
  return systemJson(`/api/order/obras/seguimiento${suffix}`)
}

/**
 * Canal en vivo (SSE) del tablero de seguimiento.
 * Eventos: `connected`, `snapshot`, `update` (payload = array de obras).
 */
export function streamObrasSeguimiento({ since, onEvent, signal } = {}) {
  const q = new URLSearchParams()
  if (since) q.set('since', String(since).trim())
  const suffix = q.toString() ? `?${q}` : ''
  return systemEventStream(`/api/order/obras/seguimiento/stream${suffix}`, {
    onEvent,
    signal,
  })
}

export async function listSeguimientoOps() {
  return systemJson('/api/order/proyectos/seguimiento/ops')
}

export async function listBiesseObrasForAssign({ q = '', limit = 30, offset = 0 } = {}) {
  const params = new URLSearchParams()
  if (q != null && String(q).trim() !== '') params.set('q', String(q).trim())
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  // Anidables: sin estado / PENDIENTE / OPTIMIZADO (no PRODUCCION+ ni ya vinculados).
  params.set('soloAsignables', 'true')
  const raw = await systemJson(`/api/order/biesse/obras?${params}`)
  const itemsRaw = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : []
  const items = itemsRaw.map((row) => ({
    orderId: Number(row.orderid ?? row.orderId) || null,
    orderName: row.ordername ?? row.orderName ?? '',
    bookingCode: row.bookingcode ?? row.bookingCode ?? null,
    opCodigo: row.op_codigo ?? row.opCodigo ?? null,
    porcentaje: row.porcentaje_completado ?? row.porcentaje ?? null,
    estadoEscaneo: row.estado_escaneo ?? row.estadoEscaneo ?? null,
  }))
  const total =
    typeof raw?.totalCount === 'number'
      ? raw.totalCount
      : typeof raw?.totalElements === 'number'
        ? raw.totalElements
        : items.length
  return { items, totalCount: total }
}

export async function assignOrdenBiesseObra(ordenId, biesseOrderId) {
  return systemJson(`/api/order/ordenes/${ordenId}/biesse-obra`, {
    method: 'PUT',
    body: JSON.stringify({ biesseOrderId: biesseOrderId ?? null }),
  })
}

export async function markProyectoEntregado(id) {
  return systemJson(`/api/order/proyectos/${id}/entregado`, { method: 'POST' })
}

export async function markObraTransmitido(biesseOrderId) {
  return systemJson(`/api/order/obras/${biesseOrderId}/transmitir`, { method: 'POST' })
}

export async function fetchAiUsageRankings() {
  return systemJson('/api/admin/config/ai-usage/rankings')
}

export async function listOdooWebhooks({ tipo = '', page = 0, size = 20 } = {}) {
  const q = new URLSearchParams({ page: String(page), size: String(size) })
  if (tipo) q.set('tipo', tipo)
  return systemJson(`/api/admin/odoo-webhooks?${q}`)
}

export async function cancelProyectoOptimizacion(id) {
  return systemJson(`/api/order/proyectos/${id}/cancelar`, { method: 'POST' })
}

export async function updateProyectoGestion(id, payload) {
  return systemJson(`/api/order/proyectos/${id}/gestion`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function saveProyectoOptimizacionCompleto(payload) {
  return systemJson('/api/order/proyectos/guardar-completo', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listMaquinasOptimizacion(activeOnly = false) {
  return systemJson(`/api/order/maquinas${activeOnly ? '/activas' : ''}`)
}

export async function createMaquinaOptimizacion(payload) {
  return systemJson('/api/order/maquinas', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateMaquinaOptimizacion(id, payload) {
  return systemJson(`/api/order/maquinas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function updateProyectoMaquina(id, maquinaId) {
  return systemJson(`/api/order/proyectos/${id}/maquina`, {
    method: 'PATCH',
    body: JSON.stringify({ maquinaId }),
  })
}

export async function uploadProyectoCotizacion(id, file, { onProgress } = {}) {
  const form = new FormData()
  form.append('file', file)
  return systemUploadWithProgress(`/api/order/proyectos/${id}/cotizacion`, form, { onProgress })
}

export function cotizacionProyectoUrl(id) {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const apiPath = systemApiBase.startsWith('http') ? systemApiBase : `${base}${systemApiBase}`
  return `${apiPath.replace(/\/+$/, '')}/api/order/proyectos/${id}/cotizacion`
}

export async function uploadProyectoPlanos(id, file, { onProgress } = {}) {
  const form = new FormData()
  form.append('file', file)
  return systemUploadWithProgress(`/api/order/proyectos/${id}/planos`, form, { onProgress })
}

export async function uploadProyectoXmlCorte(id, file) {
  const form = new FormData()
  form.append('file', file)
  return systemJson(`/api/order/proyectos/${id}/xml-corte`, {
    method: 'POST',
    body: form,
  })
}

export function planosProyectoUrl(id) {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const apiPath = systemApiBase.startsWith('http') ? systemApiBase : `${base}${systemApiBase}`
  return `${apiPath.replace(/\/+$/, '')}/api/order/proyectos/${id}/planos`
}

/** Descarga el archivo de cotización del proyecto (requiere JWT). */
export async function downloadProyectoCotizacion(id, fallbackName = 'cotizacion.pdf') {
  const tokens = getStoredTokens()
  const url = cotizacionProyectoUrl(id)
  const res = await fetch(url, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `No se pudo descargar la cotización (${res.status})`
    try {
      const body = text ? JSON.parse(text) : null
      if (body?.message) message = body.message
      else if (text && text.length < 280) message = text
    } catch {
      if (text && text.length < 280) message = text
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  if (!blob || blob.size === 0) {
    throw new Error('El archivo de cotización llegó vacío.')
  }
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  const filename = match?.[1]?.trim() || fallbackName
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Descarga el PDF de planos del proyecto (requiere JWT). */
export async function downloadProyectoPlanos(id, fallbackName = 'planos.pdf') {
  const tokens = getStoredTokens()
  const url = planosProyectoUrl(id)
  const res = await fetch(url, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `No se pudo descargar el plano (${res.status})`
    try {
      const body = text ? JSON.parse(text) : null
      if (body?.message) message = body.message
      else if (text && text.length < 280) message = text
    } catch {
      if (text && text.length < 280) message = text
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  if (!blob || blob.size === 0) {
    throw new Error('El archivo de planos llegó vacío.')
  }
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  const filename = match?.[1]?.trim() || fallbackName
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/* ——— Órdenes / proyectos (legacy) ——— */

export async function listProjects() {
  return listProyectosOptimizacion({ scope: 'todos' })
}

export async function createProject(body) {
  return systemJson('/api/order/proyectos', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getProjectById(id) {
  return getProyectoOptimizacion(id)
}

export async function createOrderInProject(projectId, body) {
  return systemJson(`/api/order/proyectos/${projectId}/ordenes`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function createOrderDetail(orderId, body) {
  return systemJson(`/api/order/ordenes/${orderId}/detalles`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/* ——— Palés ——— */

export async function getPalletCatalogs() {
  return systemJson('/api/pallets/catalogs')
}

export async function listPallets() {
  return systemJson('/api/pallets')
}

export async function listPalletAudit(params = {}) {
  const q = new URLSearchParams()
  if (params.paleId != null && String(params.paleId).trim() !== '') q.set('paleId', String(params.paleId).trim())
  if (params.action != null && String(params.action).trim() !== '') q.set('action', String(params.action).trim())
  q.set('limit', String(params.limit ?? 100))
  return systemJson(`/api/pallets/audit?${q}`)
}

export async function createPallet(body) {
  return systemJson('/api/pallets', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listPalletsByOrder(orderId) {
  return systemJson(`/api/pallets/by-order/${orderId}`)
}

export async function getPalletById(id) {
  return systemJson(`/api/pallets/${id}`)
}

export async function updatePallet(palletId, body) {
  return systemJson(`/api/pallets/${palletId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function getPalletByCode(code) {
  return systemJson(`/api/pallets/by-code/${encodeURIComponent(code)}`)
}

export async function scanPieceToPallet(palletId, body) {
  return systemJson(`/api/pallets/${palletId}/scan-piece`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function closePallet(palletId, body) {
  return systemJson(`/api/pallets/${palletId}/close`, {
    method: 'POST',
    body: body == null ? undefined : JSON.stringify(body),
  })
}

export async function deletePalletDetail(palletId, detailId) {
  return systemJson(`/api/pallets/${palletId}/details/${detailId}`, {
    method: 'DELETE',
  })
}

export async function deletePallet(palletId) {
  return systemJson(`/api/pallets/${palletId}`, {
    method: 'DELETE',
  })
}

/* ——— Gestión (flota / vehículos) ——— */

export async function listVehiculos() {
  return systemJson('/api/transport/vehiculos')
}

export async function listTransporteVehiculos() {
  return systemJson('/api/transport/vehiculos')
}

export async function getVehiculo(id) {
  return systemJson(`/api/transport/vehiculos/${id}`)
}

export async function createVehiculo(body) {
  return systemJson('/api/transport/vehiculos', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateVehiculo(id, body) {
  return systemJson(`/api/transport/vehiculos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function listGuias() {
  return systemJson('/api/inventory/guias')
}

export async function listGuiasPalesEscaneados(q) {
  const params = new URLSearchParams()
  if (q != null && String(q).trim() !== '') {
    params.set('q', String(q).trim())
  }
  const suffix = params.toString() ? `?${params}` : ''
  return systemJson(`/api/inventory/guias/pales-escaneados${suffix}`)
}

export async function getGuia(id) {
  return systemJson(`/api/inventory/guias/${id}`)
}

export async function createGuia(body) {
  const created = await systemJson('/api/inventory/guias', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (created?.id != null) {
    return getGuia(created.id)
  }
  return created
}

export async function updateGuia(id, body) {
  return systemJson(`/api/inventory/guias/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function addGuiaDetalleManual(guiaId, body) {
  return systemJson(`/api/inventory/guias/${guiaId}/detalles`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function addGuiaDetallePale(guiaId, body) {
  return systemJson(`/api/inventory/guias/${guiaId}/detalles/pale`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function removeGuiaDetalle(guiaId, detalleId) {
  return systemJson(`/api/inventory/guias/${guiaId}/detalles/${detalleId}`, {
    method: 'DELETE',
  })
}

export async function listTransportAuditoria(params = {}) {
  const q = new URLSearchParams()
  if (params.entityType != null && String(params.entityType).trim() !== '') {
    q.set('entityType', String(params.entityType).trim())
  }
  if (params.entityId != null && String(params.entityId).trim() !== '') {
    q.set('entityId', String(params.entityId).trim())
  }
  if (params.correlationId != null && String(params.correlationId).trim() !== '') {
    q.set('correlationId', String(params.correlationId).trim())
  }
  if (params.page != null) q.set('page', String(params.page))
  if (params.size != null) q.set('size', String(params.size))
  if (params.sort != null && String(params.sort).trim() !== '') {
    q.append('sort', String(params.sort).trim())
  } else {
    q.append('sort', 'occurredAt,desc')
  }
  const suffix = q.toString() ? `?${q}` : ''
  return systemJson(`/api/transport/auditoria${suffix}`)
}

/* ——— Inventario ——— */

function qs(params) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

export async function listInventoryCategorias() {
  return systemJson('/api/inventory/categorias')
}

export async function listInventoryItems({ page = 0, size = 20, q, sucursalId, tipo } = {}) {
  return systemJson(`/api/inventory/items${qs({ page, size, q, sucursalId, tipo })}`)
}

export async function listTableros({ page = 0, size = 20, q } = {}) {
  return systemJson(`/api/inventory/tableros${qs({ page, size, q })}`)
}

export async function createTablero(body) {
  return systemJson('/api/inventory/tableros', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listCantos({ page = 0, size = 20, q } = {}) {
  return systemJson(`/api/inventory/cantos${qs({ page, size, q })}`)
}

export async function createCanto(body) {
  return systemJson('/api/inventory/cantos', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getInventoryItemDetail(id, { sucursalId } = {}) {
  return systemJson(`/api/inventory/items/${id}${qs({ sucursalId })}`)
}

export async function createInventoryItem(body) {
  return systemJson('/api/inventory/items', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function addInventoryMovement(itemId, body) {
  return systemJson(`/api/inventory/items/${itemId}/movements`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/* ——— RM ——— */

export function pageContent(body) {
  if (!body || typeof body !== 'object') return []
  const c = body.content
  return Array.isArray(c) ? c : []
}

export function pageMeta(body) {
  if (!body || typeof body !== 'object') {
    return { totalElements: 0, totalPages: 0, number: 0, size: 20 }
  }
  return {
    totalElements: Number(body.totalElements) || 0,
    totalPages: Number(body.totalPages) || 0,
    number: Number(body.number) || 0,
    size: Number(body.size) || 20,
  }
}

export async function listRegistrosEntrada({
  page = 0,
  size = 20,
  q,
  fechaDesde,
  fechaHasta,
  tipoRegistro,
} = {}) {
  return systemJson(
    `/api/rm/registros-entrada${qs({
      page,
      size,
      q: q?.trim() || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      tipoRegistro: tipoRegistro?.trim() || undefined,
    })}`,
  )
}

export async function getRegistroEntrada(id) {
  return systemJson(`/api/rm/registros-entrada/${id}`)
}

export async function cancelRegistroEntrada(id, motivo) {
  return systemJson(`/api/rm/registros-entrada/${id}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  })
}

export async function listRegistrosSalida({
  page = 0,
  size = 20,
  q,
  fechaDesde,
  fechaHasta,
  tipoRegistro,
} = {}) {
  return systemJson(
    `/api/rm/registros-salida${qs({
      page,
      size,
      q: q?.trim() || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      tipoRegistro: tipoRegistro?.trim() || undefined,
    })}`,
  )
}

export async function getRegistroSalida(id) {
  return systemJson(`/api/rm/registros-salida/${id}`)
}

export async function cancelRegistroSalida(id, motivo) {
  return systemJson(`/api/rm/registros-salida/${id}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  })
}

export async function listRegistrosVehiculo({
  page = 0,
  size = 20,
  q,
  fechaDesde,
  fechaHasta,
  tipoRegistro,
} = {}) {
  return systemJson(
    `/api/rm/registros-vehiculo${qs({
      page,
      size,
      q: q?.trim() || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      tipoRegistro: tipoRegistro?.trim() || undefined,
    })}`,
  )
}

export async function getRegistroVehiculo(id) {
  return systemJson(`/api/rm/registros-vehiculo/${id}`)
}

export async function listActasConformidad({ page = 0, size = 20, q, fechaDesde, fechaHasta } = {}) {
  return systemJson(
    `/api/rm/actas-conformidad${qs({
      page,
      size,
      q: q?.trim() || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    })}`,
  )
}

export async function getActaConformidad(id) {
  return systemJson(`/api/rm/actas-conformidad/${id}`)
}

export async function cancelActaConformidad(id, motivo) {
  return systemJson(`/api/rm/actas-conformidad/${id}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  })
}

/* ——— Portal clientes (admin en SPA empleados) ——— */

export async function clientLogin(body) {
  return systemJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  })
}

export async function clientRegister(body) {
  return systemJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  })
}

export async function clientRefresh(body) {
  return systemJson('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  })
}

export async function clientLogout(body) {
  await systemJson('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  })
}

export async function clientLogoutAll() {
  await systemJson('/api/auth/logout-all', { method: 'POST' })
}

export async function clientFetchMe() {
  return systemJson('/api/auth/me')
}

export async function clientChangePassword(body) {
  await systemJson('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listClients() {
  return systemJson('/api/gestion/clientes')
}

export async function getClient(id) {
  return systemJson(`/api/gestion/clientes/${id}`)
}

export async function createClient(body) {
  return systemJson('/api/gestion/clientes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateClient(id, body) {
  return systemJson(`/api/gestion/clientes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteClient(id) {
  await systemJson(`/api/gestion/clientes/${id}`, { method: 'DELETE' })
}

export async function resetClientPassword(id, body) {
  await systemJson(`/api/gestion/clientes/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getClientLoginHistory(id, { page = 0, size = 20 } = {}) {
  const q = new URLSearchParams({ page: String(page), size: String(size) })
  return systemJson(`/api/gestion/clientes/${id}/login-history?${q}`)
}

export async function getClientAiUsage(id, { page = 0, size = 20 } = {}) {
  const q = new URLSearchParams({ page: String(page), size: String(size) })
  return systemJson(`/api/gestion/clientes/${id}/ai-usage?${q}`)
}

export async function fetchAiUsageSummary() {
  return systemJson('/api/admin/config/ai-usage/summary')
}

/* ——— Backups (admin) ——— */

export async function fetchBackupConfig() {
  return systemJson('/api/admin/backup/config')
}

export async function updateBackupConfig(body) {
  return systemJson('/api/admin/backup/config', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function runBackupNow() {
  return systemJson('/api/admin/backup/run', { method: 'POST' })
}

export async function runMediaBackupNow() {
  return systemJson('/api/admin/backup/run/files', { method: 'POST' })
}

export async function fetchBackupRun(runId) {
  return systemJson(`/api/admin/backup/history/${runId}`)
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Inicia backup y espera hasta SUCCESS/FAILED (polling). */
export async function runBackupNowAndWait(options = {}) {
  const pollMs = options.pollMs ?? 2000
  const maxWaitMs = options.maxWaitMs ?? 30 * 60 * 1000
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const started = await runBackupNow()
  const runId = started?.id
  if (!runId) {
    throw new Error('No se recibió el id del backup')
  }
  if (onProgress) onProgress(started)
  if (started.status === 'SUCCESS' || started.status === 'FAILED') {
    if (started.status === 'FAILED') {
      throw new Error(started.message || 'El backup falló')
    }
    return started
  }
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await sleep(pollMs)
    const run = await fetchBackupRun(runId)
    if (onProgress) onProgress(run)
    if (run.status === 'SUCCESS' || run.status === 'FAILED') {
      if (run.status === 'FAILED') {
        throw new Error(run.message || 'El backup falló')
      }
      return run
    }
  }
  throw new Error('El backup sigue en curso. Revise el historial en unos minutos.')
}

/** Inicia backup solo de archivos y espera hasta SUCCESS/FAILED. */
export async function runMediaBackupNowAndWait(options = {}) {
  const pollMs = options.pollMs ?? 2000
  const maxWaitMs = options.maxWaitMs ?? 30 * 60 * 1000
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const started = await runMediaBackupNow()
  const runId = started?.id
  if (!runId) {
    throw new Error('No se recibió el id del backup de archivos')
  }
  if (onProgress) onProgress(started)
  if (started.status === 'SUCCESS' || started.status === 'FAILED') {
    if (started.status === 'FAILED') {
      throw new Error(started.message || 'El backup de archivos falló')
    }
    return started
  }
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await sleep(pollMs)
    const run = await fetchBackupRun(runId)
    if (onProgress) onProgress(run)
    if (run.status === 'SUCCESS' || run.status === 'FAILED') {
      if (run.status === 'FAILED') {
        throw new Error(run.message || 'El backup de archivos falló')
      }
      return run
    }
  }
  throw new Error('El backup de archivos sigue en curso. Revise el historial en unos minutos.')
}

export async function fetchBackupHistory() {
  return systemJson('/api/admin/backup/history')
}

export async function restoreBackupFromHistory(body) {
  return systemJson('/api/admin/backup/restore', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function restoreMediaBackupFromHistory(body) {
  return systemJson('/api/admin/backup/restore/files', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function restoreBackupUpload(confirmText, file, opts = {}) {
  const form = new FormData()
  form.append('confirmText', confirmText)
  form.append('file', file)
  form.append('overwriteMedia', opts.overwriteMedia ? 'true' : 'false')
  return systemUploadWithProgress('/api/admin/backup/restore/upload', form, {
    forceRefresh: true,
    onProgress: opts.onProgress,
    signal: opts.signal,
  })
}

export async function restoreMediaBackupUpload(confirmText, file, opts = {}) {
  const form = new FormData()
  form.append('confirmText', confirmText)
  form.append('file', file)
  form.append('overwriteMedia', opts.overwriteMedia ? 'true' : 'false')
  return systemUploadWithProgress('/api/admin/backup/restore/files/upload', form, {
    forceRefresh: true,
    onProgress: opts.onProgress,
    signal: opts.signal,
  })
}

export async function fetchRestoreHistory() {
  return systemJson('/api/admin/backup/restore/history')
}

/** Espera restauración por id (misma tabla backup_run). */
export async function waitForBackupRun(runId, options = {}) {
  const pollMs = options.pollMs ?? 2000
  const maxWaitMs = options.maxWaitMs ?? 60 * 60 * 1000
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const run = await fetchBackupRun(runId)
    if (onProgress) onProgress(run)
    if (run.status === 'SUCCESS' || run.status === 'FAILED') {
      if (run.status === 'FAILED') {
        throw new Error(run.message || 'La operación falló')
      }
      return run
    }
    await sleep(pollMs)
  }
  throw new Error('La operación sigue en curso. Revise el historial.')
}

export async function downloadBackupFile(runId, filename) {
  const blob = await systemDownloadBlob(
    `/api/admin/backup/history/${runId}/files/${encodeURIComponent(filename)}`,
  )
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/* ——— Configuración global (admin) ——— */

export async function fetchAppConfig() {
  return systemJson('/api/admin/config')
}

export async function updateAppConfig(body) {
  return systemJson('/api/admin/config', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function testAppMail(body) {
  await systemJson('/api/admin/config/mail/test', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function testAppTelegram(body) {
  await systemJson('/api/admin/config/telegram/test', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function testAppWhatsApp(body) {
  await systemJson('/api/admin/config/whatsapp/test', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function resetKardexInventory() {
  return systemJson('/api/admin/config/kardex/reset', { method: 'POST' })
}

export async function fetchPlantillaPlanillaInfo() {
  return systemJson('/api/admin/config/plantilla-planilla')
}

export async function uploadPlantillaPlanilla(file) {
  const form = new FormData()
  form.append('file', file)
  return systemJson('/api/admin/config/plantilla-planilla', {
    method: 'POST',
    body: form,
  })
}

export async function deletePlantillaPlanilla() {
  return systemJson('/api/admin/config/plantilla-planilla', { method: 'DELETE' })
}

export async function downloadPlantillaPlanillaAdmin() {
  const tokens = getStoredTokens()
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const apiPath = systemApiBase.startsWith('http') ? systemApiBase : `${base}${systemApiBase}`
  const url = `${apiPath.replace(/\/+$/, '')}/api/admin/config/plantilla-planilla?download=true`
  const res = await fetch(url, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'No se pudo descargar la plantilla')
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  const filename = match?.[1] || 'plantilla_listado_piezas.xlsx'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/* ——— Notificaciones empleado (SSE) ——— */

export async function fetchNotificationUnreadCount() {
  return systemJson('/api/notifications/unread-count')
}

export async function fetchNotifications() {
  return systemJson('/api/notifications')
}

export async function markNotificationRead(id) {
  return systemJson(`/api/notifications/${id}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead() {
  return systemJson('/api/notifications/read-all', { method: 'POST' })
}

/** Monitor CNC (agente OSI) — module-system :8080 */
export async function listAgentMachines() {
  return systemJson('/api/biesse/monitor/machines')
}

export async function getAgentMonitorConfig() {
  return systemJson('/api/biesse/monitor/config')
}

export async function listAgentEventsSummary(hours = 24) {
  const q = new URLSearchParams({ hours: String(hours) })
  return systemJson(`/api/biesse/monitor/events/summary?${q}`)
}

export async function listAgentAlarms(limit = 40) {
  const q = new URLSearchParams({ limit: String(limit) })
  return systemJson(`/api/biesse/monitor/alarms?${q}`)
}

export async function listAgentEvents(limit = 80) {
  const q = new URLSearchParams({ limit: String(limit) })
  return systemJson(`/api/biesse/monitor/events?${q}`)
}

export async function listAgentCutPieces({ limit = 40, orderId } = {}) {
  const q = new URLSearchParams({ limit: String(limit) })
  if (orderId != null && orderId !== '') q.set('orderId', String(orderId))
  return systemJson(`/api/biesse/monitor/cut-pieces?${q}`)
}

export async function listAgentCutTimes({ op, orderId, limit = 80 } = {}) {
  const q = new URLSearchParams()
  if (op) q.set('op', String(op))
  if (orderId != null) q.set('orderId', String(orderId))
  q.set('limit', String(limit))
  return systemJson(`/api/biesse/monitor/cut-times?${q}`)
}

/** Historial agregado por obra: duración total, seccionadores, ventanas CORTE_FIN. */
export async function listAgentCutTimesSummary({ op, orderId, limit = 40 } = {}) {
  const q = new URLSearchParams()
  if (op) q.set('op', String(op))
  if (orderId != null) q.set('orderId', String(orderId))
  q.set('limit', String(limit))
  return systemJson(`/api/biesse/monitor/cut-times/summary?${q}`)
}

/** Planchas en vivo: por máquina + total_live / total_today. */
export async function listAgentBoardsLive() {
  return systemJson('/api/biesse/monitor/boards/live')
}

/** Historial de planchas cortadas (from/to = yyyy-MM-dd). */
export async function listAgentBoardsHistory({ from, to, machineId, limit = 100 } = {}) {
  const q = new URLSearchParams()
  if (from) q.set('from', String(from))
  if (to) q.set('to', String(to))
  if (machineId != null && machineId !== '') q.set('machineId', String(machineId))
  q.set('limit', String(limit))
  return systemJson(`/api/biesse/monitor/boards/history?${q}`)
}

/** Resumen de planchas por máquina en rango de fechas (respeta machineId). */
export async function listAgentBoardsSummary({ from, to, machineId } = {}) {
  const q = new URLSearchParams()
  if (from) q.set('from', String(from))
  if (to) q.set('to', String(to))
  if (machineId != null && machineId !== '') q.set('machineId', String(machineId))
  return systemJson(`/api/biesse/monitor/boards/summary?${q}`)
}

/**
 * Canal en vivo (SSE) del monitor de seccionadoras.
 * Eventos: connected, snapshot, update, ping. Payload: { machines, boards_live, server_time }.
 */
export function streamAgentMonitor({ onEvent, signal } = {}) {
  return systemEventStream('/api/biesse/monitor/stream', { onEvent, signal })
}

export async function listAgentTrazabilidad({ op, orderId, limit = 100 } = {}) {
  const q = new URLSearchParams()
  if (op) q.set('op', String(op))
  if (orderId != null) q.set('orderId', String(orderId))
  q.set('limit', String(limit))
  return systemJson(`/api/biesse/monitor/trazabilidad?${q}`)
}

export async function createAgentMachine({ machineName, plantName } = {}) {
  return systemJson('/api/biesse/monitor/machines', {
    method: 'POST',
    body: JSON.stringify({
      machineName: machineName || 'BIESSE-OSI',
      plantName: plantName || null,
    }),
  })
}

export async function rotateAgentMachineToken(machineId) {
  return systemJson(`/api/biesse/monitor/machines/${machineId}/rotate-token`, {
    method: 'POST',
    body: '{}',
  })
}

export async function deleteAgentMachine(machineId) {
  return systemJson(`/api/biesse/monitor/machines/${machineId}`, {
    method: 'DELETE',
  })
}

