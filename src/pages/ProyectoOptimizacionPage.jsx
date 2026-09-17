import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import * as systemApi from '../api/systemApi'
import { DetailModal } from '../components/DetailModal.jsx'
import {
  ModuleFilterGrid,
  ModuleHeader,
  ModuleListCard,
  ModulePage,
  ModuleTabs,
} from '../components/module/ModuleChrome.jsx'
import { useAppAbility } from '../access/useAppAbility'
import { FEATURE } from '../access/permissionCatalog'
import { useAuth } from '../auth/AuthContext'
import { ProyectoOrdenPiezasModal } from '../components/ProyectoOrdenPiezasModal.jsx'
import { ClientDetailModal } from '../components/ClientDetailModal.jsx'
import { OrdenBiesseObraAssign } from '../components/OrdenBiesseObraAssign.jsx'
import { gestionClientePortalHref } from '../utils/gestionPaths'
import {
  ESTADOS_PROYECTO,
  canCapturarProyectoOptimizacion,
  downloadProyectoJson,
  emptyProyectoFilters,
  formatEstadoProyecto,
  estadoTagClass,
  formatProyectoDate,
} from '../utils/proyectoOptimizacion.js'
import {
  downloadOrderCsvFromTree,
  downloadOrderExcelFromTree,
  downloadOrderTextFromTree,
} from '../utils/proyectoExcelExport.js'
import { PROYECTO_COTIZACION_EVENT } from '../notifications/proyectoCotizacionEvents.js'
import { useEmployeeNotifications } from '../notifications/useEmployeeNotifications.js'

const TAB_MIS = 'mis'
const TAB_TODOS = 'todos'

function resolveProyectoTab(raw) {
  return raw === TAB_TODOS ? TAB_TODOS : TAB_MIS
}

function ProyectoTreeSummary({
  tree,
  onDownloadOrderExcel,
  onDownloadOrderText,
  onDownloadOrderCsv,
  onOrdenBiesseAssigned,
  canAssignBiesse = false,
}) {
  const { allowedDashboard } = useAuth()
  const ability = useAppAbility()
  const base = allowedDashboard ? `/dashboard/${allowedDashboard}` : '/dashboard/admin-produccion'
  const canManagePortal = ability.can('view', FEATURE.GESTION_CLIENTES_PORTAL)
  const project = tree?.project
  const orders = tree?.orders ?? []
  const [ordenPiezas, setOrdenPiezas] = useState(null)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  if (!project) return <p className="muted">Sin datos.</p>

  const tiempos = project.estadoTiempos
  const historial = [
    ['Enviado', tiempos?.enviado],
    ['En atención', tiempos?.enAtencion],
    ['Cotizado', tiempos?.cotizado],
    ['Vendido', tiempos?.vendido],
    ['Transmitido', tiempos?.optimizado],
    ['Producción', tiempos?.produccion],
    ['Despacho', tiempos?.despacho],
    ['Listo para entregar', tiempos?.listoParaEntregar],
    ['Entregado', tiempos?.entregado],
    ['Cancelado', tiempos?.cancelado],
  ].filter(([, value]) => value)

  return (
    <div className="stack gap-4">
      <dl className="detail-dl">
        <div>
          <dt>Cliente</dt>
          <dd style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
            <span>{project.cliente || '—'}</span>
            {project.clientUserId ? (
              <>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setClientModalOpen(true)}
                >
                  Ver cliente
                </button>
                {canManagePortal ? (
                  <Link
                    to={gestionClientePortalHref(base, project.clientUserId)}
                    className="btn btn--ghost btn--sm"
                  >
                    Gestionar en portal
                  </Link>
                ) : null}
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Referencia</dt>
          <dd>{project.referencia || '—'}</dd>
        </div>
        <div>
          <dt>Descripción</dt>
          <dd>{project.descripcion || '—'}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <span className={estadoTagClass(project.estado)}>{formatEstadoProyecto(project.estado)}</span>
          </dd>
        </div>
        <div>
          <dt>Vendedor</dt>
          <dd>{project.vendedorNombre || 'Sin asignar'}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{formatProyectoDate(project.fechaCreacion)}</dd>
        </div>
        {project.maquinaParametros ? (
          <div>
            <dt>Parámetros (P_PARAMS)</dt>
            <dd>{project.maquinaParametros}</dd>
          </div>
        ) : null}
        {historial.length ? (
          <div>
            <dt>Historial de estados</dt>
            <dd>
              <ul className="stack gap-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {historial.map(([label, value]) => (
                  <li key={label} className="small">
                    <strong>{label}:</strong> {formatProyectoDate(value)}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      {orders.length ? (
        <div>
          <h3 className="card__title" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
            Órdenes ({orders.length})
          </h3>
          <ul className="stack gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {orders.map((o) => (
              <li key={o.id} className="card pad" style={{ margin: 0 }}>
                <div className="proyecto-orden-row">
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 140px' }}>
                        <strong>{o.codigo || `Orden ${o.id}`}</strong>
                        {o.descripcion ? <span className="muted small"> — {o.descripcion}</span> : null}
                        <p className="small muted" style={{ marginTop: 4, marginBottom: 0 }}>
                          {(o.detalles ?? []).length} pieza(s)
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setOrdenPiezas(o)}
                        >
                          Ver detalle
                        </button>
                        {(o.detalles ?? []).length ? (
                          <>
                            {onDownloadOrderExcel ? (
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => onDownloadOrderExcel(o)}
                              >
                                Excel
                              </button>
                            ) : null}
                            {onDownloadOrderText ? (
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => onDownloadOrderText(o)}
                              >
                                TXT
                              </button>
                            ) : null}
                            {onDownloadOrderCsv ? (
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => onDownloadOrderCsv(o)}
                              >
                                CSV
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div
                    className="card pad proyecto-orden-biesse-panel"
                    style={{
                      margin: 0,
                      padding: '0.65rem 0.75rem',
                      background: 'var(--surface-2, #f6f7f9)',
                      border: '1px solid var(--border, #e2e5ea)',
                    }}
                  >
                    <strong className="small" style={{ display: 'block', marginBottom: 4 }}>
                      Obra / XML Biesse
                    </strong>
                    {canAssignBiesse || o.biesseOrderId ? (
                      <OrdenBiesseObraAssign
                        orden={o}
                        disabled={!canAssignBiesse}
                        onAssigned={(updated) => onOrdenBiesseAssigned?.(o.id, updated)}
                      />
                    ) : (
                      <p className="muted small" style={{ margin: 0 }}>
                        Sin permiso para asignar. Abra el detalle o use un rol con acceso a proyectos.
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">Sin órdenes registradas.</p>
      )}
      <ProyectoOrdenPiezasModal
        order={ordenPiezas}
        canAssignBiesse={canAssignBiesse}
        onOrdenBiesseAssigned={(ordenId, updated) => {
          onOrdenBiesseAssigned?.(ordenId, updated)
          setOrdenPiezas((prev) =>
            prev && prev.id === ordenId
              ? {
                  ...prev,
                  biesseOrderId: updated?.biesseOrderId ?? null,
                  biesseOrderName: updated?.biesseOrderName ?? null,
                  opCodigo: updated?.opCodigo ?? null,
                }
              : prev,
          )
        }}
        onClose={() => setOrdenPiezas(null)}
      />
      <ClientDetailModal
        open={clientModalOpen}
        proyectoId={project.id}
        clientLabel={project.cliente}
        onClose={() => setClientModalOpen(false)}
      />
    </div>
  )
}

export function ProyectoOptimizacionPage() {
  const ability = useAppAbility()
  const isAdmin = ability.can('manage', 'all')
  const canAssignBiesse =
    ability.can('create', FEATURE.PROJECT_LIST) ||
    ability.can('update', FEATURE.PROJECT_LIST) ||
    ability.can('manage', FEATURE.PROJECT_LIST) ||
    ability.can('view', FEATURE.GESTION_PROYECTOS) ||
    ability.can('update', FEATURE.GESTION_PROYECTOS) ||
    isAdmin
  const { markAllRead } = useEmployeeNotifications()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTabState] = useState(() => resolveProyectoTab(searchParams.get('tab')))

  const [filters, setFilters] = useState(emptyProyectoFilters())
  const [applied, setApplied] = useState(emptyProyectoFilters())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailTree, setDetailTree] = useState(null)
  const [detailRow, setDetailRow] = useState(null)
  const [maquinas, setMaquinas] = useState([])
  const [maquinaDraftId, setMaquinaDraftId] = useState('')
  const [maquinaForm, setMaquinaForm] = useState({ codigo: '', nombre: '' })
  const cotizacionInputRef = useRef(null)
  const cotizacionTargetIdRef = useRef(null)
  const planosInputRef = useRef(null)
  const planosTargetIdRef = useRef(null)
  const xmlCorteInputRef = useRef(null)
  const xmlCorteTargetIdRef = useRef(null)
  const [uploadProgress, setUploadProgress] = useState(null)

  const setTab = useCallback(
    (id) => {
      setTabState(id)
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (id === TAB_MIS) p.delete('tab')
          else p.set('tab', id)
          return p
        },
        { replace: true },
      )
      const empty = emptyProyectoFilters()
      setFilters(empty)
      setApplied(empty)
    },
    [setSearchParams],
  )

  useEffect(() => {
    const fromUrl = resolveProyectoTab(searchParams.get('tab'))
    setTabState((current) => (current === fromUrl ? current : fromUrl))
  }, [searchParams])

  const buildListParams = useCallback(() => {
    const params = {
      scope: tab === TAB_MIS ? 'mis' : 'todos',
      nombre: applied.nombre || undefined,
      cliente: applied.cliente || undefined,
      vendedor: tab === TAB_TODOS ? applied.vendedor || undefined : undefined,
      fechaDesde: applied.fechaDesde || undefined,
      fechaHasta: applied.fechaHasta || undefined,
    }
    if (tab === TAB_MIS && applied.estado) {
      params.estado = applied.estado
    }
    return params
  }, [tab, applied])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await systemApi.listProyectosOptimizacion(buildListParams())
      setRows(Array.isArray(list) ? list : [])
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los proyectos.')
    } finally {
      setLoading(false)
    }
  }, [buildListParams])

  useEffect(() => {
    void markAllRead()
  }, [markAllRead])

  useEffect(() => {
    function onLiveProyecto() {
      void load()
    }
    window.addEventListener(PROYECTO_COTIZACION_EVENT, onLiveProyecto)
    return () => window.removeEventListener(PROYECTO_COTIZACION_EVENT, onLiveProyecto)
  }, [load])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void systemApi
      .listProyectosOptimizacion(buildListParams())
      .then((list) => {
        if (!cancelled) setRows(Array.isArray(list) ? list : [])
      })
      .catch((e) => {
        if (!cancelled) {
          setRows([])
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los proyectos.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [buildListParams])

  useEffect(() => {
    void systemApi.listMaquinasOptimizacion(true).then((list) => {
      setMaquinas(Array.isArray(list) ? list : [])
    }).catch(() => setMaquinas([]))
  }, [])

  const tabs = useMemo(
    () => [
      { id: TAB_MIS, label: 'Mis proyectos' },
      { id: TAB_TODOS, label: 'Todos los proyectos' },
    ],
    [],
  )

  function applyFilters(e) {
    e?.preventDefault?.()
    setApplied({ ...filters })
  }

  function resetFilters() {
    const empty = emptyProyectoFilters()
    setFilters(empty)
    setApplied(empty)
  }

  async function openDetail(row) {
    setDetailRow(row)
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError('')
    setDetailTree(null)
    try {
      const tree = await systemApi.getProyectoOptimizacion(row.id)
      setDetailTree(tree)
      const project = tree?.project
      setMaquinaDraftId(project?.maquinaId ? String(project.maquinaId) : '')
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'No se pudo cargar el detalle.')
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setDetailOpen(false)
    setDetailRow(null)
    setDetailTree(null)
    setDetailError('')
  }

  function handleDownloadOrderExcel(order) {
    if (!detailTree) return
    try {
      downloadOrderExcelFromTree(order, detailTree)
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'No se pudo descargar el Excel.')
    }
  }

  function handleDownloadOrderText(order) {
    if (!detailTree) return
    try {
      downloadOrderTextFromTree(order, detailTree)
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'No se pudo descargar el TXT.')
    }
  }

  function handleDownloadOrderCsv(order) {
    if (!detailTree) return
    try {
      downloadOrderCsvFromTree(order, detailTree)
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'No se pudo descargar el CSV.')
    }
  }

  async function handleDownload(row) {
    setBusyId(row.id)
    setActionMsg('')
    try {
      const tree = await systemApi.getProyectoOptimizacion(row.id)
      const safeName = (row.nombre || `proyecto-${row.id}`).replace(/[^\w.-]+/g, '_')
      downloadProyectoJson(`${safeName}.json`, tree)
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'No se pudo descargar el proyecto.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleCapturar(row) {
    if (row.vendedorId != null) {
      setActionMsg('Este proyecto ya tiene un vendedor asignado.')
      return
    }
    setBusyId(row.id)
    setActionMsg('')
    try {
      await systemApi.capturarProyectoOptimizacion(row.id)
      setActionMsg(`Proyecto «${row.nombre}» capturado y asignado a usted.`)
      await load()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'No se pudo capturar el proyecto.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleVendido(row) {
    const nombre = row.nombre || `proyecto ${row.id}`
    if (!window.confirm(`¿Marcar el proyecto «${nombre}» como vendido?`)) {
      return
    }
    setBusyId(row.id)
    setActionMsg('')
    try {
      await systemApi.markProyectoVendido(row.id)
      setActionMsg(`Proyecto «${nombre}» marcado como vendido.`)
      await load()
      if (detailRow?.id === row.id) {
        const tree = await systemApi.getProyectoOptimizacion(row.id)
        setDetailTree(tree)
        setDetailRow((prev) => (prev ? { ...prev, estado: 'VENDIDO' } : prev))
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'No se pudo marcar como vendido.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleMaquinaSave() {
    if (!detailRow || !maquinaDraftId) return
    setBusyId(detailRow.id)
    setActionMsg('')
    try {
      await systemApi.updateProyectoMaquina(detailRow.id, Number(maquinaDraftId))
      setActionMsg('Máquina asignada al proyecto.')
      const tree = await systemApi.getProyectoOptimizacion(detailRow.id)
      setDetailTree(tree)
      await load()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'No se pudo asignar la máquina.')
    } finally {
      setBusyId(null)
    }
  }

  function promptUploadCotizacion(rowId) {
    cotizacionTargetIdRef.current = rowId
    cotizacionInputRef.current?.click()
  }

  async function handleCotizacionSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const rowId = cotizacionTargetIdRef.current
    cotizacionTargetIdRef.current = null
    if (!file || !rowId) return
    const ok = window.confirm(
      `¿Subir «${file.name}» como COTIZACIÓN?\n\nEsto no reemplaza los planos. El proyecto pasará a estado Cotizado.`,
    )
    if (!ok) return
    setBusyId(rowId)
    setUploadProgress({ label: 'Subiendo cotización…', pct: 0 })
    setActionMsg('')
    try {
      await systemApi.uploadProyectoCotizacion(rowId, file, {
        onProgress: (pct) => setUploadProgress({ label: 'Subiendo cotización…', pct }),
      })
      setActionMsg('Cotización subida. El proyecto pasó a estado Cotizado.')
      await load()
      if (detailRow?.id === rowId) {
        const tree = await systemApi.getProyectoOptimizacion(rowId)
        setDetailTree(tree)
        setDetailRow((prev) =>
          prev
            ? {
                ...prev,
                estado: 'COTIZADO',
                tieneCotizacion: true,
                cotizacionArchivo: tree?.project?.cotizacionArchivo || prev.cotizacionArchivo,
              }
            : prev,
        )
      }
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'No se pudo subir la cotización.')
    } finally {
      setBusyId(null)
      setUploadProgress(null)
    }
  }

  function promptUploadPlanos(rowId) {
    planosTargetIdRef.current = rowId
    planosInputRef.current?.click()
  }

  async function handleDownloadCotizacion(row) {
    if (!row?.id) return
    if (!row.tieneCotizacion && !(detailRow?.id === row.id && detailTree?.project?.cotizacionArchivo)) {
      setActionMsg('Este proyecto aún no tiene cotización subida.')
      return
    }
    setBusyId(row.id)
    setActionMsg('')
    try {
      const safe = String(row.nombre || 'proyecto')
        .replace(/[^\w\-]+/g, '_')
        .slice(0, 80)
      await systemApi.downloadProyectoCotizacion(row.id, `cotizacion_${safe}.pdf`)
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'No se pudo descargar la cotización.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDownloadPlanos(row) {
    if (!row?.id) return
    const hasPlano =
      Boolean(row.tienePlano) ||
      (detailRow?.id === row.id && Boolean(detailTree?.project?.planoArchivo))
    if (!hasPlano) {
      setActionMsg('Este proyecto aún no tiene planos subidos.')
      return
    }
    setBusyId(row.id)
    setActionMsg('')
    try {
      const safe = String(row.nombre || 'proyecto')
        .replace(/[^\w\-]+/g, '_')
        .slice(0, 80)
      await systemApi.downloadProyectoPlanos(row.id, `planos_${safe}.pdf`)
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'No se pudo descargar el plano.')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePlanosSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const rowId = planosTargetIdRef.current
    planosTargetIdRef.current = null
    if (!file || !rowId) return
    const ok = window.confirm(
      `¿Subir «${file.name}» como PLANOS (PDF)?\n\nEsto no reemplaza la cotización. El cliente podrá verlos en el portal.`,
    )
    if (!ok) return
    setBusyId(rowId)
    setUploadProgress({ label: 'Subiendo planos…', pct: 0 })
    setActionMsg('')
    try {
      await systemApi.uploadProyectoPlanos(rowId, file, {
        onProgress: (pct) => setUploadProgress({ label: 'Subiendo planos…', pct }),
      })
      setActionMsg('Planos subidos. El cliente podrá verlos en el portal (sin descarga).')
      await load()
      if (detailRow?.id === rowId) {
        const tree = await systemApi.getProyectoOptimizacion(rowId)
        setDetailTree(tree)
        setDetailRow((prev) =>
          prev
            ? {
                ...prev,
                tienePlano: true,
                planoArchivo: tree?.project?.planoArchivo || prev.planoArchivo,
              }
            : prev,
        )
      }
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'No se pudieron subir los planos.')
    } finally {
      setBusyId(null)
      setUploadProgress(null)
    }
  }

  async function handleAddMaquina(e) {
    e.preventDefault()
    if (!maquinaForm.codigo.trim() || !maquinaForm.nombre.trim()) return
    setActionMsg('')
    try {
      await systemApi.createMaquinaOptimizacion({
        codigo: maquinaForm.codigo.trim(),
        nombre: maquinaForm.nombre.trim(),
        activo: true,
      })
      setMaquinaForm({ codigo: '', nombre: '' })
      const list = await systemApi.listMaquinasOptimizacion(true)
      setMaquinas(Array.isArray(list) ? list : [])
      setActionMsg('Máquina registrada.')
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'No se pudo registrar la máquina.')
    }
  }

  function canMarcarVendido(row) {
    return row?.estado === 'COTIZADO'
  }

  function canSubirXmlCorte(row) {
    return row?.estado === 'VENDIDO'
  }

  function promptUploadXmlCorte(rowId) {
    xmlCorteTargetIdRef.current = rowId
    xmlCorteInputRef.current?.click()
  }

  async function handleXmlCorteSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const rowId = xmlCorteTargetIdRef.current
    xmlCorteTargetIdRef.current = null
    if (!file || !rowId) return
    const ok = window.confirm(
      `¿Subir «${file.name}» como XML de corte?\n\nEl proyecto pasará a estado Optimizado.`,
    )
    if (!ok) return
    setBusyId(rowId)
    setActionMsg('')
    try {
      await systemApi.uploadProyectoXmlCorte(rowId, file)
      setActionMsg('XML de corte subido. El proyecto pasó a estado Optimizado.')
      await load()
      if (detailRow?.id === rowId) {
        const tree = await systemApi.getProyectoOptimizacion(rowId)
        setDetailTree(tree)
        setDetailRow((prev) => (prev ? { ...prev, estado: 'OPTIMIZADO' } : prev))
      }
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'No se pudo subir el XML de corte.')
    } finally {
      setBusyId(null)
    }
  }

  function canCapturar(row) {
    return canCapturarProyectoOptimizacion(row)
  }

  return (
    <ModulePage>
      {uploadProgress ? (
        <div className="upload-progress-overlay" role="status" aria-live="polite">
          <div className="upload-progress-card">
            <div className="upload-progress-spinner" aria-hidden />
            <p className="upload-progress-label">{uploadProgress.label}</p>
            <p className="upload-progress-pct">{uploadProgress.pct}%</p>
            <div
              className="upload-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress.pct}
            >
              <span className="upload-progress-fill" style={{ width: `${uploadProgress.pct}%` }} />
            </div>
          </div>
        </div>
      ) : null}
      <input
        ref={cotizacionInputRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.doc,.docx,application/pdf"
        hidden
        onChange={(e) => void handleCotizacionSelected(e)}
      />
      <input
        ref={planosInputRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => void handlePlanosSelected(e)}
      />
      <input
        ref={xmlCorteInputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        hidden
        onChange={(e) => void handleXmlCorteSelected(e)}
      />
      <ModuleHeader
        title="Proyecto optimización"
        lead={
          tab === TAB_MIS
            ? 'Proyectos asignados a usted como vendedor. Filtre por estado, cliente, nombre o fechas.'
            : 'Todos los proyectos enviados por clientes. Capture los que aún no tengan vendedor.'
        }
      />

      <ModuleTabs tabs={tabs} activeId={tab} onChange={setTab} ariaLabel="Ámbito de proyectos" />

      {actionMsg ? (
        <p className="card pad small" style={{ marginBottom: '1rem' }}>
          {actionMsg}
        </p>
      ) : null}

      <ModuleListCard
        title={tab === TAB_MIS ? 'Mis proyectos' : 'Todos los proyectos'}
        toolbar={
          <form onSubmit={applyFilters}>
            <ModuleFilterGrid>
              {tab === TAB_MIS ? (
                <label className="field">
                  <span>Estado</span>
                  <select
                    value={filters.estado}
                    onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
                  >
                    {ESTADOS_PROYECTO.map((o) => (
                      <option key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="field">
                <span>Nombre proyecto</span>
                <input
                  value={filters.nombre}
                  onChange={(e) => setFilters((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Buscar por nombre"
                />
              </label>
              <label className="field">
                <span>Cliente</span>
                <input
                  value={filters.cliente}
                  onChange={(e) => setFilters((f) => ({ ...f, cliente: e.target.value }))}
                  placeholder="Nombre del cliente"
                />
              </label>
              {tab === TAB_TODOS ? (
                <label className="field">
                  <span>Vendedor</span>
                  <input
                    value={filters.vendedor}
                    onChange={(e) => setFilters((f) => ({ ...f, vendedor: e.target.value }))}
                    placeholder="Nombre del vendedor"
                  />
                </label>
              ) : null}
              <label className="field">
                <span>Desde</span>
                <input
                  type="date"
                  value={filters.fechaDesde}
                  onChange={(e) => setFilters((f) => ({ ...f, fechaDesde: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>Hasta</span>
                <input
                  type="date"
                  value={filters.fechaHasta}
                  onChange={(e) => setFilters((f) => ({ ...f, fechaHasta: e.target.value }))}
                />
              </label>
            </ModuleFilterGrid>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: '0.75rem' }}>
              <button type="submit" className="btn btn--primary">
                Filtrar
              </button>
              <button type="button" className="btn btn--ghost" onClick={resetFilters}>
                Limpiar
              </button>
              <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => void load()}>
                Actualizar
              </button>
            </div>
          </form>
        }
        error={error}
        loading={loading}
        loadingText="Cargando proyectos…"
      >
        {!loading && !rows.length ? <p className="pad muted">No hay proyectos con los filtros seleccionados.</p> : null}
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Vendedor</th>
                  <th>Órdenes</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.nombre}</td>
                    <td>{row.cliente || '—'}</td>
                    <td>
                      <span className={estadoTagClass(row.estado)}>{formatEstadoProyecto(row.estado)}</span>
                    </td>
                    <td>{row.vendedorNombre || '—'}</td>
                    <td>{row.cantidadOrdenes ?? 0}</td>
                    <td className="small whitespace-nowrap">{formatProyectoDate(row.fechaCreacion)}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={busyId === row.id}
                          onClick={() => void openDetail(row)}
                        >
                          Ver detalle
                        </button>
                        {tab === TAB_MIS ? (
                          <>
                            <button
                              type="button"
                              className="btn btn--ghost"
                              disabled={busyId === row.id}
                              onClick={() => promptUploadCotizacion(row.id)}
                            >
                              {row.tieneCotizacion ? 'Actualizar cotización' : 'Subir cotización'}
                            </button>
                            {row.tieneCotizacion ? (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                disabled={busyId === row.id}
                                onClick={() => void handleDownloadCotizacion(row)}
                              >
                                Descargar cotización
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn--ghost"
                              disabled={busyId === row.id}
                              onClick={() => promptUploadPlanos(row.id)}
                            >
                              {row.tienePlano ? 'Actualizar planos' : 'Subir planos'}
                            </button>
                            {row.tienePlano ? (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                disabled={busyId === row.id}
                                onClick={() => void handleDownloadPlanos(row)}
                              >
                                Descargar planos
                              </button>
                            ) : null}
                            {canMarcarVendido(row) ? (
                              <button
                                type="button"
                                className="btn btn--primary"
                                disabled={busyId === row.id}
                                onClick={() => void handleVendido(row)}
                              >
                                Vendido
                              </button>
                            ) : null}
                            {canSubirXmlCorte(row) ? (
                              <button
                                type="button"
                                className="btn btn--primary"
                                disabled={busyId === row.id}
                                title="Subir XML de corte"
                                onClick={() => promptUploadXmlCorte(row.id)}
                              >
                                <Save size={16} aria-hidden /> Subir XML de corte
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        {tab === TAB_TODOS && row.tieneCotizacion ? (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            disabled={busyId === row.id}
                            onClick={() => void handleDownloadCotizacion(row)}
                          >
                            Descargar cotización
                          </button>
                        ) : null}
                        {tab === TAB_TODOS && row.tienePlano ? (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            disabled={busyId === row.id}
                            onClick={() => void handleDownloadPlanos(row)}
                          >
                            Descargar planos
                          </button>
                        ) : null}
                        {tab === TAB_TODOS && canCapturar(row) ? (
                          <button
                            type="button"
                            className="btn btn--primary"
                            disabled={busyId === row.id}
                            onClick={() => void handleCapturar(row)}
                          >
                            Capturar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ModuleListCard>

      <DetailModal
        open={detailOpen}
        title={detailRow ? detailRow.nombre : 'Detalle del proyecto'}
        subtitle={
          detailRow
            ? `${formatEstadoProyecto(detailRow.estado)} · ${formatProyectoDate(detailRow.fechaCreacion)}`
            : ''
        }
        onClose={closeDetail}
      >
        {detailLoading ? <p className="muted">Cargando detalle…</p> : null}
        {detailError ? <p className="form-error">{detailError}</p> : null}
        {!detailLoading && !detailError && detailTree ? (
          <>
            <ProyectoTreeSummary
              tree={detailTree}
              canAssignBiesse={canAssignBiesse}
              onDownloadOrderExcel={handleDownloadOrderExcel}
              onDownloadOrderText={handleDownloadOrderText}
              onDownloadOrderCsv={handleDownloadOrderCsv}
              onOrdenBiesseAssigned={(ordenId, updated) => {
                void (async () => {
                  setDetailTree((prev) => {
                    if (!prev) return prev
                    return {
                      ...prev,
                      orders: (prev.orders ?? []).map((o) =>
                        o.id === ordenId
                          ? {
                              ...o,
                              biesseOrderId: updated?.biesseOrderId ?? null,
                              biesseOrderName: updated?.biesseOrderName ?? null,
                              opCodigo: updated?.opCodigo ?? null,
                            }
                          : o,
                      ),
                    }
                  })
                  // El backend avanza el proyecto (OPTIMIZADO o el estado_escaneo de la obra).
                  // Recargar detalle + listado para reflejar el nuevo estado.
                  const proyectoId = detailRow?.id
                  if (!proyectoId) return
                  try {
                    const tree = await systemApi.getProyectoOptimizacion(proyectoId)
                    setDetailTree(tree)
                    const nextEstado = tree?.project?.estado
                    if (nextEstado) {
                      setDetailRow((prev) => (prev ? { ...prev, estado: nextEstado } : prev))
                      setRows((prev) =>
                        prev.map((r) => (r.id === proyectoId ? { ...r, estado: nextEstado } : r)),
                      )
                      setActionMsg(
                        updated?.biesseOrderId == null
                          ? 'Obra Biesse desvinculada.'
                          : `XML/obra anidada. Proyecto en estado ${formatEstadoProyecto(nextEstado)}.`,
                      )
                    }
                  } catch {
                    /* el vínculo local ya quedó; el listado se actualizará al recargar */
                  }
                })()
              }}
            />

            {!detailRow?.estado || detailRow.estado === 'ENVIADO' || detailRow.estado === 'EN_ATENCION' || detailRow.estado === 'COTIZADO' ? (
              tab === TAB_MIS ? (
                <div className="pad" style={{ paddingLeft: 0, paddingRight: 0, marginTop: '1rem' }}>
                  <label className="field">
                    <span>Máquina (P_PARAMS)</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                      <select value={maquinaDraftId} onChange={(e) => setMaquinaDraftId(e.target.value)}>
                        <option value="">Sin asignar</option>
                        {maquinas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre} ({m.codigo})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={busyId === detailRow?.id || !maquinaDraftId}
                        onClick={() => void handleMaquinaSave()}
                      >
                        Guardar máquina
                      </button>
                    </div>
                  </label>
                </div>
              ) : null
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: '1rem', flexWrap: 'wrap' }}>
              {detailRow && tab === TAB_MIS ? (
                <>
                  <button type="button" className="btn btn--ghost" onClick={() => void handleDownload(detailRow)}>
                    Descargar JSON
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => promptUploadCotizacion(detailRow.id)}
                  >
                    {detailRow.tieneCotizacion || detailTree?.project?.cotizacionArchivo
                      ? 'Actualizar cotización'
                      : 'Subir cotización'}
                  </button>
                  {detailRow.tieneCotizacion || detailTree?.project?.cotizacionArchivo ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busyId === detailRow.id}
                      onClick={() => void handleDownloadCotizacion(detailRow)}
                    >
                      Descargar cotización
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => promptUploadPlanos(detailRow.id)}
                  >
                    {detailRow.tienePlano || detailTree?.project?.planoArchivo
                      ? 'Actualizar planos'
                      : 'Subir planos'}
                  </button>
                  {detailRow.tienePlano || detailTree?.project?.planoArchivo ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busyId === detailRow.id}
                      onClick={() => void handleDownloadPlanos(detailRow)}
                    >
                      Descargar planos
                    </button>
                  ) : null}
                  {canMarcarVendido(detailRow) ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busyId === detailRow.id}
                      onClick={() => void handleVendido(detailRow)}
                    >
                      Vendido
                    </button>
                  ) : null}
                  {canSubirXmlCorte(detailRow) ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busyId === detailRow.id}
                      title="Subir XML de corte"
                      onClick={() => promptUploadXmlCorte(detailRow.id)}
                    >
                      <Save size={16} aria-hidden /> Subir XML de corte
                    </button>
                  ) : null}
                </>
              ) : null}
              {detailRow && tab === TAB_TODOS ? (
                <>
                  {detailRow.tieneCotizacion || detailTree?.project?.cotizacionArchivo ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busyId === detailRow.id}
                      onClick={() => void handleDownloadCotizacion(detailRow)}
                    >
                      Descargar cotización
                    </button>
                  ) : null}
                  {detailRow.tienePlano || detailTree?.project?.planoArchivo ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busyId === detailRow.id}
                      onClick={() => void handleDownloadPlanos(detailRow)}
                    >
                      Descargar planos
                    </button>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={closeDetail}>
                Cerrar
              </button>
            </div>
          </>
        ) : null}
      </DetailModal>

      {isAdmin ? (
        <section className="card pad" style={{ marginTop: '1.5rem' }}>
          <h2 className="card__title mb-3">Máquinas de optimización</h2>
          <p className="small muted mb-4">
            Código usado en P_PARAMS al exportar a Excel (ej. DEF - SEKTOR470).
          </p>
          <form onSubmit={handleAddMaquina} className="toolbar toolbar--wrap mb-4">
            <label className="field" style={{ flex: '1 1 200px', margin: 0 }}>
              <span>Código P_PARAMS</span>
              <input
                value={maquinaForm.codigo}
                onChange={(e) => setMaquinaForm((f) => ({ ...f, codigo: e.target.value }))}
                placeholder="DEF - SEKTOR470"
              />
            </label>
            <label className="field" style={{ flex: '1 1 200px', margin: 0 }}>
              <span>Nombre</span>
              <input
                value={maquinaForm.nombre}
                onChange={(e) => setMaquinaForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Sector 470"
              />
            </label>
            <button type="submit" className="btn btn--primary">
              Agregar máquina
            </button>
          </form>
          {maquinas.length ? (
            <ul className="stack gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {maquinas.map((m) => (
                <li key={m.id} className="small">
                  <strong>{m.nombre}</strong> — <code>{m.codigo}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No hay máquinas registradas.</p>
          )}
        </section>
      ) : null}
    </ModulePage>
  )
}
