import { formatAppDateTime, parseAppDateTime } from './appDateTime.js'

export const ESTADOS_PROYECTO = [
  { value: '', label: 'Todos los estados' },
  { value: 'ENVIADO', label: 'Enviado' },
  { value: 'EN_ATENCION', label: 'En atención' },
  { value: 'COTIZADO', label: 'Cotizado' },
  { value: 'VENDIDO', label: 'Vendido' },
  { value: 'OPTIMIZADO', label: 'Transmitido' },
  { value: 'PRODUCCION', label: 'Producción' },
  { value: 'DESPACHO', label: 'Despacho' },
  { value: 'LISTO_PARA_ENTREGAR', label: 'Listo para entregar' },
  { value: 'ENTREGADO', label: 'Entregado' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

export const ESTADOS_SEGUIMIENTO = [
  'OPTIMIZADO',
  'PRODUCCION',
  'DESPACHO',
  'LISTO_PARA_ENTREGAR',
  'ENTREGADO',
]

export function formatEstadoProyecto(value) {
  const map = {
    ENVIADO: 'Enviado',
    EN_ATENCION: 'En atención',
    COTIZADO: 'Cotizado',
    VENDIDO: 'Vendido',
    OPTIMIZADO: 'Transmitido',
    PRODUCCION: 'Producción',
    DESPACHO: 'Despacho',
    LISTO_PARA_ENTREGAR: 'Listo para entregar',
    ENTREGADO: 'Entregado',
    CANCELADO: 'Cancelado',
  }
  const key = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  return map[key] || value || '—'
}

export function estadoTagClass(estado) {
  const key = String(estado ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  switch (key) {
    case 'ENVIADO':
      return 'tag tag--estado-enviado'
    case 'EN_ATENCION':
      return 'tag tag--estado-atencion'
    case 'COTIZADO':
      return 'tag tag--estado-cotizado'
    case 'VENDIDO':
      return 'tag tag--estado-vendido'
    case 'OPTIMIZADO':
      return 'tag tag--estado-optimizado'
    case 'PRODUCCION':
      return 'tag tag--estado-produccion'
    case 'DESPACHO':
      return 'tag tag--estado-despacho'
    case 'LISTO_PARA_ENTREGAR':
      return 'tag tag--estado-listo'
    case 'ENTREGADO':
      return 'tag tag--estado-entregado'
    case 'CANCELADO':
      return 'tag tag--estado-cancelado'
    default:
      return 'tag'
  }
}

export function canCapturarProyectoOptimizacion(row) {
  if (!row || row.vendedorId != null) return false
  const estado = row.estado
  return (
    estado !== 'CANCELADO' &&
    estado !== 'VENDIDO' &&
    !ESTADOS_SEGUIMIENTO.includes(estado)
  )
}

export function formatProyectoEstadoTiempo(estadoTiempos, estado) {
  if (!estadoTiempos || !estado) return null
  const keyMap = {
    ENVIADO: 'enviado',
    EN_ATENCION: 'enAtencion',
    COTIZADO: 'cotizado',
    VENDIDO: 'vendido',
    OPTIMIZADO: 'optimizado',
    PRODUCCION: 'produccion',
    DESPACHO: 'despacho',
    LISTO_PARA_ENTREGAR: 'listoParaEntregar',
    ENTREGADO: 'entregado',
    CANCELADO: 'cancelado',
  }
  const field = keyMap[estado]
  return field ? estadoTiempos[field] : null
}

export function formatProyectoDate(value) {
  return formatAppDateTime(value)
}

export function emptyProyectoFilters() {
  return {
    estado: '',
    nombre: '',
    cliente: '',
    vendedor: '',
    fechaDesde: '',
    fechaHasta: '',
  }
}

export function filterProyectosClientSide(rows, filters) {
  const nombreQ = filters.nombre?.trim().toLowerCase()
  const clienteQ = filters.cliente?.trim().toLowerCase()
  const estado = filters.estado?.trim()
  const desde = filters.fechaDesde ? parseAppDateTime(`${filters.fechaDesde}T00:00:00`) : null
  const hasta = filters.fechaHasta ? parseAppDateTime(`${filters.fechaHasta}T23:59:59`) : null

  return rows.filter((row) => {
    if (estado && row.estado !== estado) return false
    if (nombreQ && !`${row.nombre || ''}`.toLowerCase().includes(nombreQ)) return false
    if (clienteQ && !`${row.cliente || ''}`.toLowerCase().includes(clienteQ)) return false
    if (desde || hasta) {
      const d = parseAppDateTime(row.fechaCreacion)
      if (!d || Number.isNaN(d.getTime())) return false
      if (desde && d < desde) return false
      if (hasta && d > hasta) return false
    }
    return true
  })
}

export function detalleToPayload(detalle) {
  return {
    tablero: detalle.tablero ?? '',
    cantidad: detalle.cantidad ?? '',
    largoVeta: detalle.largoVeta ?? '',
    ancho: detalle.ancho ?? '',
    veta: detalle.veta ?? '',
    l1: detalle.l1 ?? '',
    l2: detalle.l2 ?? '',
    a1: detalle.a1 ?? '',
    a2: detalle.a2 ?? '',
    perforacionCantidad: detalle.perforacionCantidad ?? '',
    perforacionLado1: detalle.perforacionLado1 ?? '',
    perforacionLado2: detalle.perforacionLado2 ?? '',
    ranuraDist: detalle.ranuraDist ?? '',
    ranuraProf: detalle.ranuraProf ?? '',
    ranuraEs: detalle.ranuraEs ?? '',
    ranuraLado: detalle.ranuraLado ?? '',
    ranuraEspecial: Boolean(detalle.ranuraEspecial),
    observado: Boolean(detalle.observado),
    observacion: detalle.observacion ?? '',
  }
}

export function treeToSavePayload(tree, projectDraft) {
  const project = tree?.project
  if (!project?.id) {
    throw new Error('Proyecto no válido para guardar.')
  }
  return {
    projectId: project.id,
    project: {
      nombre: projectDraft.nombre ?? project.nombre ?? '',
      descripcion: projectDraft.descripcion ?? project.descripcion ?? '',
      cliente: projectDraft.cliente ?? project.cliente ?? '',
      referencia: projectDraft.referencia ?? project.referencia ?? '',
    },
    orders: (tree.orders ?? []).map((order) => ({
      codigo: order.codigo ?? '',
      descripcion: order.descripcion ?? '',
      detalles: (order.detalles ?? []).map(detalleToPayload),
    })),
  }
}

export function downloadProyectoJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
