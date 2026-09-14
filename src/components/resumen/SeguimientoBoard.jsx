import { useEffect, useMemo, useRef, useState } from 'react'
import { formatAppDateTime, formatDurationInEstado, parseAppDateTime } from '../../utils/appDateTime.js'
import { estadoTagClass, formatEstadoProyecto } from '../../utils/proyectoOptimizacion.js'

const FLIGHT_MS = 1600
const ARRIVE_MS = 2200

/** Pipeline completo: comercial + producción. */
const BOARD_ESTADOS = [
  'ENVIADO',
  'EN_ATENCION',
  'COTIZADO',
  'VENDIDO',
  'OPTIMIZADO',
  'PRODUCCION',
  'DESPACHO',
  'LISTO_PARA_ENTREGAR',
  'ENTREGADO',
]

const COL_LABEL = {
  ENVIADO: 'Enviado',
  EN_ATENCION: 'Atención',
  COTIZADO: 'Cotizado',
  VENDIDO: 'Vendido',
  OPTIMIZADO: 'Transmitido',
  PRODUCCION: 'Producción',
  DESPACHO: 'Despacho',
  LISTO_PARA_ENTREGAR: 'Listo',
  ENTREGADO: 'Hoy',
}

const COL_PHASE = {
  ENVIADO: 'comercial',
  EN_ATENCION: 'comercial',
  COTIZADO: 'comercial',
  VENDIDO: 'comercial',
  OPTIMIZADO: 'obra',
  PRODUCCION: 'obra',
  DESPACHO: 'obra',
  LISTO_PARA_ENTREGAR: 'obra',
  ENTREGADO: 'obra',
}

const SEGUIMIENTO_COLUMNS = BOARD_ESTADOS.map((id) => ({
  id,
  label: COL_LABEL[id] ?? id,
  phase: COL_PHASE[id] ?? 'obra',
}))

const OBRA_ESTADOS = new Set(['OPTIMIZADO', 'PRODUCCION', 'DESPACHO', 'LISTO_PARA_ENTREGAR', 'ENTREGADO'])

function normalizeEstado(raw) {
  const e = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  if (e === 'ENVIANDO') return 'ENVIADO'
  if (e === 'COMPLETADA' || e === 'COMPLETADO') return 'LISTO_PARA_ENTREGAR'
  if (e === 'EN_PROCESO') return 'DESPACHO'
  if (e === 'PENDIENTE' || e === '') return 'OPTIMIZADO'
  return e
}

function limaTodayKey() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return null
  }
}

function isSameLimaDay(value, dayKey) {
  if (!dayKey) return true
  const d = parseAppDateTime(value)
  if (!d) return false
  try {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
    return key === dayKey
  } catch {
    return false
  }
}

/** Vendido: máximo 48 horas desde que entró al estado. */
function isWithinLastHours(value, hours, nowMs = Date.now()) {
  const d = parseAppDateTime(value)
  if (!d) return false
  const maxAgeMs = Math.max(0, Number(hours) || 0) * 60 * 60 * 1000
  return nowMs - d.getTime() <= maxAgeMs
}

function clampPct(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function ProgressRow({ label, pct, detail, tone = 'scan' }) {
  const value = clampPct(pct)
  return (
    <div className={`seguimiento-progress seguimiento-progress--${tone}`}>
      <div className="seguimiento-progress__head">
        <span>{label}</span>
        <span className="seguimiento-progress__pct">{value.toFixed(value % 1 ? 1 : 0)}%</span>
      </div>
      <div
        className="seguimiento-progress__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="seguimiento-progress__fill" style={{ width: `${value}%` }} />
      </div>
      {detail ? <span className="seguimiento-progress__detail muted">{detail}</span> : null}
    </div>
  )
}

/** Orden anidada dentro de card de proyecto (fase comercial). */
function OrdenRow({ orden, nowTick }) {
  const hasXml = orden.biesseOrderId != null
  const estado = hasXml ? normalizeEstado(orden.estadoEscaneo) : null
  const name =
    orden.biesseOrderName || orden.codigo || (orden.ordenId != null ? `Orden #${orden.ordenId}` : 'Orden')
  const estadoDesde = orden.estadoDesde ?? orden.estado_desde ?? null
  const enEstado = hasXml ? formatDurationInEstado(estadoDesde, new Date(nowTick)) : ''
  const desdeLabel = formatAppDateTime(estadoDesde, {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  return (
    <li className="seguimiento-orden">
      <div className="seguimiento-orden__head">
        <strong className="seguimiento-orden__name" title={name}>
          {name}
        </strong>
        {estado ? (
          <span className={`${estadoTagClass(estado)} seguimiento-orden__tag`}>
            {formatEstadoProyecto(estado)}
          </span>
        ) : (
          <span className="tag seguimiento-orden__tag">Sin XML</span>
        )}
      </div>
      <div className="seguimiento-orden__meta">
        {orden.codigo ? <span className="muted small">{orden.codigo}</span> : null}
        {orden.opCodigo ? <span className="muted small">OP {orden.opCodigo}</span> : null}
      </div>
      {enEstado ? (
        <p className="seguimiento-orden__tiempo">
          En XML · <strong>{enEstado}</strong>
          {desdeLabel && desdeLabel !== '—' ? <span className="muted"> · {desdeLabel}</span> : null}
        </p>
      ) : !hasXml ? (
        <p className="seguimiento-orden__tiempo muted">Falta anidar XML</p>
      ) : null}
    </li>
  )
}

/** Card de XML en columnas de obra (Transmitido → Entregado). */
function XmlCard({ item, nowTick, arrived }) {
  const { proyecto, orden, estado } = item
  const name =
    orden.biesseOrderName ||
    orden.orderName ||
    orden.codigo ||
    (orden.biesseOrderId != null
      ? `XML #${orden.biesseOrderId}`
      : orden.ordenId != null
        ? `Orden #${orden.ordenId}`
        : 'XML')
  const estadoDesde = orden.estadoDesde ?? orden.estado_desde ?? null
  const enEstado = formatDurationInEstado(estadoDesde, new Date(nowTick))
  const desdeLabel = formatAppDateTime(estadoDesde, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const flightKey = String(orden.biesseOrderId ?? orden.ordenId)
  const isArrived = arrived.has(flightKey)
  const proyectoLabel =
    proyecto?.nombre ||
    (proyecto?.proyectoId != null ? `Proyecto #${proyecto.proyectoId}` : null) ||
    'Sin proyecto'

  return (
    <li
      className={`seguimiento-card seguimiento-card--xml${isArrived ? ' seguimiento-card--arrive' : ''}`}
    >
      <div className="seguimiento-card__head">
        <strong className="seguimiento-card__name" title={name}>
          {name}
        </strong>
        <span className={`${estadoTagClass(estado)} seguimiento-card__estado`}>
          {formatEstadoProyecto(estado)}
        </span>
      </div>
      <div className="seguimiento-card__meta">
        <span className="muted small" title={proyectoLabel}>
          {proyectoLabel}
        </span>
        {proyecto?.cliente ? <span className="muted small">{proyecto.cliente}</span> : null}
        {orden.opCodigo ? <span className="muted small">OP {orden.opCodigo}</span> : null}
        {orden.bookingCode ? <span className="muted small">{orden.bookingCode}</span> : null}
        {orden.seccionador ? <span className="muted small">Secc. {orden.seccionador}</span> : null}
      </div>
      {enEstado ? (
        <p
          className="seguimiento-card__tiempo"
          title={desdeLabel && desdeLabel !== '—' ? `Desde ${desdeLabel}` : undefined}
        >
          En este estado · <strong>{enEstado}</strong>
          {desdeLabel && desdeLabel !== '—' ? (
            <span className="muted"> · desde {desdeLabel}</span>
          ) : null}
        </p>
      ) : null}
      <ProgressRow label="Escaneo" pct={orden.porcentaje} detail={orden.avanceLabel || null} tone="scan" />
      <ProgressRow
        label="Cortes"
        pct={orden.porcentajeCorte}
        detail={orden.avanceCorteLabel || null}
        tone="cut"
      />
    </li>
  )
}

function ProyectoCard({ proyecto, nowTick, arrived }) {
  const id = proyecto.proyectoId
  const isArrived = arrived.has(`p-${id}`)
  const ordenes = Array.isArray(proyecto.ordenes) ? proyecto.ordenes : []
  const estadoDesde = proyecto.estadoDesde ?? proyecto.estado_desde ?? null
  const enEstado = formatDurationInEstado(estadoDesde, new Date(nowTick))
  const desdeLabel = formatAppDateTime(estadoDesde, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const estado = normalizeEstado(proyecto.estado)

  return (
    <li
      className={`seguimiento-card seguimiento-card--proyecto${isArrived ? ' seguimiento-card--arrive' : ''}`}
    >
      <div className="seguimiento-card__head">
        <strong className="seguimiento-card__name" title={proyecto.nombre || ''}>
          {proyecto.nombre || `Proyecto #${id}`}
        </strong>
        <span className={`${estadoTagClass(estado)} seguimiento-card__estado`}>
          {formatEstadoProyecto(estado)}
        </span>
      </div>
      {enEstado ? (
        <p className="seguimiento-card__tiempo" title={desdeLabel ? `Desde ${desdeLabel}` : undefined}>
          En estado · <strong>{enEstado}</strong>
          {desdeLabel ? <span className="muted"> · desde {desdeLabel}</span> : null}
        </p>
      ) : null}
      <div className="seguimiento-card__meta">
        {proyecto.cliente ? <span className="muted small">{proyecto.cliente}</span> : null}
        <span className="muted small">
          {ordenes.length} orden{ordenes.length === 1 ? '' : 'es'}
        </span>
      </div>
      {ordenes.length ? (
        <ul className="seguimiento-ordenes">
          {ordenes.map((o) => (
            <OrdenRow
              key={o.ordenId ?? `${id}-${o.biesseOrderId}`}
              orden={o}
              nowTick={nowTick}
            />
          ))}
        </ul>
      ) : (
        <p className="muted small">Sin órdenes</p>
      )}
    </li>
  )
}

/**
 * Tablero híbrido:
 * - Comercial (Enviado→Vendido): cards de **proyecto**
 * - Obra (Optimizado→Entregado): cards de **XML** desde obras Biesse (todas las que están en seguimiento),
 *   enriquecidas con proyecto CRM cuando existe anidación.
 */
export function SeguimientoBoard({
  proyectos = [],
  obras = [],
  loading = false,
  live = false,
  since = '2026-09-09',
  onReconnectLive,
}) {
  const sinceValue = since || '2026-09-09'
  const prevXmlEstadosRef = useRef(new Map())
  const prevProyectoEstadosRef = useRef(new Map())
  const primedRef = useRef(false)
  const rootRef = useRef(null)
  const [flights, setFlights] = useState([])
  const [arrived, setArrived] = useState(() => new Set())
  const [fullscreen, setFullscreen] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const todayKey = useMemo(() => limaTodayKey(), [nowTick])

  /** biesseOrderId → { proyecto, orden CRM } para enriquecer cards de obra. */
  const crmByBiesseId = useMemo(() => {
    const map = new Map()
    for (const p of proyectos) {
      const ordenes = Array.isArray(p.ordenes) ? p.ordenes : []
      for (const orden of ordenes) {
        const bid = Number(orden?.biesseOrderId)
        if (!Number.isFinite(bid) || bid <= 0) continue
        if (!map.has(bid)) {
          map.set(bid, { proyecto: p, orden })
        }
      }
    }
    return map
  }, [proyectos])

  /** Proyectos en columnas comerciales. */
  const proyectosByEstado = useMemo(() => {
    const map = Object.fromEntries(
      BOARD_ESTADOS.filter((e) => COL_PHASE[e] === 'comercial').map((e) => [e, []]),
    )
    for (const p of proyectos) {
      const estado = normalizeEstado(p.estado)
      if (!map[estado]) continue
      if (estado === 'COTIZADO') {
        const desde = p.estadoDesde ?? p.estado_desde ?? p.fechacreacion
        if (!isWithinLastHours(desde, 48, nowTick)) continue
      }
      map[estado].push(p)
    }
    return map
  }, [proyectos, nowTick])

  /**
   * XMLs en columnas de obra (Optimizado→Entregado): un XML = un solo estado.
   * Fuente Biesse + CRM; Entregado solo del día (Lima).
   */
  const xmlByEstado = useMemo(() => {
    const map = Object.fromEntries(
      BOARD_ESTADOS.filter((e) => COL_PHASE[e] === 'obra').map((e) => [e, []]),
    )
    const seen = new Set()

    const pushItem = (item) => {
      const bid = Number(item.orden?.biesseOrderId)
      if (Number.isFinite(bid) && bid > 0) {
        if (seen.has(bid)) return
        seen.add(bid)
      }
      let estado = normalizeEstado(item.estado)
      if (!OBRA_ESTADOS.has(estado)) estado = 'OPTIMIZADO'
      if (estado === 'ENTREGADO') {
        const desde = item.orden.estadoDesde ?? item.orden.estado_desde
        // Sin fecha no se puede saber el día → no mostrar (tablero limpio al día siguiente).
        if (!desde || !isSameLimaDay(desde, todayKey)) return
      }
      map[estado]?.push({ ...item, estado })
    }

    for (const o of obras ?? []) {
      const biesseOrderId = Number(o.orderId ?? o.orderid)
      if (!Number.isFinite(biesseOrderId) || biesseOrderId <= 0) continue
      const linked = crmByBiesseId.get(biesseOrderId)
      const orden = {
        biesseOrderId,
        biesseOrderName: o.orderName ?? o.ordername ?? linked?.orden?.biesseOrderName ?? null,
        orderName: o.orderName ?? o.ordername ?? null,
        codigo: linked?.orden?.codigo ?? null,
        ordenId: linked?.orden?.ordenId ?? null,
        opCodigo: o.opCodigo ?? o.op_codigo ?? linked?.orden?.opCodigo ?? null,
        bookingCode: o.bookingCode ?? o.bookingcode ?? null,
        seccionador: o.seccionador ?? linked?.orden?.seccionador ?? null,
        porcentaje: o.porcentaje ?? linked?.orden?.porcentaje ?? null,
        avanceLabel: o.avanceLabel ?? o.avance_label ?? linked?.orden?.avanceLabel ?? null,
        porcentajeCorte: o.porcentajeCorte ?? o.porcentaje_corte ?? linked?.orden?.porcentajeCorte ?? null,
        avanceCorteLabel:
          o.avanceCorteLabel ?? o.avance_corte_label ?? linked?.orden?.avanceCorteLabel ?? null,
        estadoEscaneo: o.estadoEscaneo ?? o.estado_escaneo ?? linked?.orden?.estadoEscaneo ?? null,
        estadoDesde:
          o.estadoDesde ??
          o.estado_desde ??
          linked?.orden?.estadoDesde ??
          linked?.orden?.estado_desde ??
          null,
      }
      pushItem({
        key: `obra-${biesseOrderId}`,
        proyecto: linked?.proyecto ?? { proyectoId: null, nombre: 'Sin proyecto', cliente: null },
        orden,
        estado: orden.estadoEscaneo,
      })
    }

    // CRM anidados que no vinieron en el listado de obras (sin repetir).
    for (const p of proyectos) {
      const ordenes = Array.isArray(p.ordenes) ? p.ordenes : []
      for (const orden of ordenes) {
        if (orden?.biesseOrderId == null) continue
        pushItem({
          key: `${p.proyectoId}-${orden.ordenId ?? orden.biesseOrderId}`,
          proyecto: p,
          orden,
          estado: orden.estadoEscaneo,
        })
      }
    }
    return map
  }, [obras, proyectos, crmByBiesseId, todayKey])

  const totalProyectos = proyectos.length
  const totalXml = useMemo(
    () =>
      Object.values(xmlByEstado).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0),
    [xmlByEstado],
  )
  const hasData = totalProyectos > 0 || totalXml > 0 || (Array.isArray(obras) && obras.length > 0)

  useEffect(() => {
    const prevXml = prevXmlEstadosRef.current
    const prevProy = prevProyectoEstadosRef.current
    const nextXml = new Map()
    const nextProy = new Map()
    const newFlights = []
    const newlyArrived = []

    for (const list of Object.values(xmlByEstado)) {
      for (const item of list) {
        const id = String(item.orden.biesseOrderId ?? item.orden.ordenId)
        nextXml.set(id, item.estado)
        if (!primedRef.current) continue
        const before = prevXml.get(id)
        if (before && before !== item.estado) {
          const fromIdx = BOARD_ESTADOS.indexOf(before)
          const toIdx = BOARD_ESTADOS.indexOf(item.estado)
          if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
            const name =
              item.orden.biesseOrderName ||
              item.orden.orderName ||
              item.orden.codigo ||
              item.proyecto?.nombre ||
              `XML #${id}`
            newFlights.push({
              key: `${id}-${before}-${item.estado}-${Date.now()}`,
              name,
              fromIdx,
              toIdx,
            })
            newlyArrived.push(id)
          }
        }
      }
    }

    for (const list of Object.values(proyectosByEstado)) {
      for (const p of list) {
        const id = String(p.proyectoId ?? p.id)
        const estado = normalizeEstado(p.estado)
        nextProy.set(id, estado)
        if (!primedRef.current) continue
        const before = prevProy.get(id)
        if (before && before !== estado) {
          const fromIdx = BOARD_ESTADOS.indexOf(before)
          const toIdx = BOARD_ESTADOS.indexOf(estado)
          if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
            newFlights.push({
              key: `p-${id}-${before}-${estado}-${Date.now()}`,
              name: p.nombre || `Proyecto #${id}`,
              fromIdx,
              toIdx,
            })
            newlyArrived.push(`p-${id}`)
          }
        }
      }
    }

    prevXmlEstadosRef.current = nextXml
    prevProyectoEstadosRef.current = nextProy
    if (!primedRef.current) {
      primedRef.current = true
      return
    }

    if (newFlights.length) {
      setFlights((f) => [...f, ...newFlights].slice(-8))
      setArrived((prevSet) => {
        const s = new Set(prevSet)
        for (const id of newlyArrived) s.add(id)
        return s
      })
      const t = window.setTimeout(() => {
        setArrived((prevSet) => {
          const s = new Set(prevSet)
          for (const id of newlyArrived) s.delete(id)
          return s
        })
      }, ARRIVE_MS)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [xmlByEstado, proyectosByEstado])

  useEffect(() => {
    if (!fullscreen) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event) {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [fullscreen])

  useEffect(() => {
    if (!fullscreen) return undefined
    const el = rootRef.current
    if (!el || typeof el.requestFullscreen !== 'function') return undefined
    let cancelled = false
    void el.requestFullscreen().catch(() => {})
    function onFsChange() {
      if (cancelled) return
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      cancelled = true
      document.removeEventListener('fullscreenchange', onFsChange)
      if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {})
      }
    }
  }, [fullscreen])

  function dismissFlight(key) {
    setFlights((f) => f.filter((x) => x.key !== key))
  }

  function toggleFullscreen() {
    setFullscreen((v) => !v)
  }

  const steps = SEGUIMIENTO_COLUMNS.length

  return (
    <div
      ref={rootRef}
      className={`seguimiento${fullscreen ? ' seguimiento--fullscreen' : ''}`}
    >
      {fullscreen ? (
        <button
          type="button"
          className="seguimiento-fs-exit"
          onClick={toggleFullscreen}
          title="Salir de pantalla completa (Esc)"
        >
          Esc · Salir
        </button>
      ) : (
        <header className="seguimiento-top">
          <div className="seguimiento-top__main">
            <div className="seguimiento-top__title-row">
              <h1 className="seguimiento-top__title">Seguimiento</h1>
              <span className={`seguimiento-live${live ? '' : ' seguimiento-live--off'}`}>
                <span className="seguimiento-live__dot" aria-hidden />
                {live ? 'En vivo' : 'Reconectando…'}
              </span>
              {!live && typeof onReconnectLive === 'function' ? (
                <button type="button" className="seguimiento-live-btn" onClick={onReconnectLive}>
                  <span className="seguimiento-live-btn__dot" aria-hidden />
                  Reintentar
                </button>
              ) : null}
              <button
                type="button"
                className="seguimiento-fs-btn"
                onClick={toggleFullscreen}
                aria-pressed={false}
                title="Pantalla completa"
              >
                Pantalla completa
              </button>
            </div>
            <p className="seguimiento-top__lead muted small">
              Tablero desde <strong>{sinceValue}</strong> (Gestión → Configuración). Cotizado máx. 48 h ·
              Entregado solo hoy. Cada XML en un solo estado.
            </p>
            <p className="seguimiento-top__count muted small">
              {totalProyectos} proyecto{totalProyectos === 1 ? '' : 's'} · {totalXml} XML en obra
            </p>
          </div>
          <div className="seguimiento-top__aside">
            <div className="seguimiento-legend" aria-hidden>
              <span className="seguimiento-legend__item seguimiento-legend__item--comercial">
                Comercial = proyecto
              </span>
              <span className="seguimiento-legend__item seguimiento-legend__item--obra">
                Obra = XML
              </span>
            </div>
          </div>
        </header>
      )}

      {loading && !hasData ? (
        <div className="app-loading" style={{ minHeight: '30vh' }}>
          <div className="app-loading__spinner" aria-hidden />
          <p className="text-sm">Cargando seguimiento…</p>
        </div>
      ) : null}

      {!loading || hasData ? (
        <div className="seguimiento-track">
          <div className="seguimiento-rail" aria-hidden={flights.length === 0}>
            <div className="seguimiento-rail__line" />
            <div className="seguimiento-rail__stops">
              {SEGUIMIENTO_COLUMNS.map((col) => (
                <div
                  key={col.id}
                  className={`seguimiento-rail__stop seguimiento-rail__stop--${col.phase}`}
                >
                  <span className="seguimiento-rail__dot" />
                  <span className="seguimiento-rail__label">{col.label}</span>
                </div>
              ))}
            </div>
            {flights.map((f) => {
              const fromPct = ((f.fromIdx + 0.5) / steps) * 100
              const toPct = ((f.toIdx + 0.5) / steps) * 100
              return (
                <div
                  key={f.key}
                  className="seguimiento-flight"
                  style={{
                    '--from-pct': `${fromPct}%`,
                    '--to-pct': `${toPct}%`,
                    animationDuration: `${FLIGHT_MS}ms`,
                  }}
                  onAnimationEnd={() => dismissFlight(f.key)}
                >
                  <span className="seguimiento-flight__glow" />
                  <span className="seguimiento-flight__chip" title={f.name}>
                    {f.name}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="seguimiento-board seguimiento-board--full">
            {SEGUIMIENTO_COLUMNS.map((col) => {
              const isObra = col.phase === 'obra'
              const list = isObra ? xmlByEstado[col.id] ?? [] : proyectosByEstado[col.id] ?? []
              const count = list.length
              return (
                <section
                  key={col.id}
                  className={`seguimiento-col seguimiento-col--${col.id.toLowerCase()} seguimiento-col--phase-${col.phase}`}
                >
                  <h2 className="seguimiento-col__title">
                    <span
                      className={`${estadoTagClass(col.id)} seguimiento-col__tag`}
                      title={
                        col.id === 'ENTREGADO'
                          ? 'XML entregados solo del día'
                          : col.id === 'LISTO_PARA_ENTREGAR'
                            ? 'Listo para entregar'
                            : col.label
                      }
                    >
                      {col.id === 'ENTREGADO' ? 'Entregado' : col.label}
                    </span>
                    <span className="seguimiento-col__count">{count}</span>
                  </h2>
                  <p className="seguimiento-col__phase muted">
                    {col.id === 'ENTREGADO'
                      ? 'XML · solo hoy'
                      : col.id === 'COTIZADO'
                        ? 'Proyectos · máx. 48 h'
                        : col.id === 'VENDIDO' || col.id === 'ENVIADO' || col.id === 'EN_ATENCION'
                          ? `Desde ${sinceValue}`
                          : isObra
                            ? `XML · desde ${sinceValue}`
                            : 'Por proyecto'}
                  </p>
                  <ul className="seguimiento-col__list">
                    {count === 0 ? (
                      <li className="seguimiento-empty muted small">Vacío</li>
                    ) : isObra ? (
                      list.map((item) => (
                        <XmlCard
                          key={item.key}
                          item={item}
                          nowTick={nowTick}
                          arrived={arrived}
                        />
                      ))
                    ) : (
                      list.map((p) => (
                        <ProyectoCard
                          key={p.proyectoId}
                          proyecto={p}
                          nowTick={nowTick}
                          arrived={arrived}
                        />
                      ))
                    )}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
