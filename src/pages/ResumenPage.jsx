import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import * as biesseApi from '../api/biesseApi'
import * as systemApi from '../api/systemApi'
import {
  canViewResumen,
  canViewResumenPage,
  canViewVentasResumen,
  defaultDashboardPath,
} from '../access/permissions'
import { useAuth } from '../auth/AuthContext'
import { ResumenDashboard } from '../components/resumen/ResumenDashboard'
import { VentasAtencionDashboard } from '../components/resumen/VentasAtencionDashboard'
import { SeguimientoBoard } from '../components/resumen/SeguimientoBoard'
import { ModulePage, ModuleTabs } from '../components/module/ModuleChrome.jsx'
import { roleDisplayName } from '../utils/adminAccess'

function buildResumenTabs(showOperacion, showVentas) {
  const tabs = []
  if (showOperacion) tabs.push({ id: 'operacion', label: 'Operación' })
  if (showVentas) tabs.push({ id: 'ventas', label: 'Ventas' })
  if (showVentas || showOperacion) tabs.push({ id: 'seguimiento', label: 'Seguimiento' })
  return tabs
}

export function ResumenPage() {
  const { role } = useParams()
  const { employee, allowedDashboard } = useAuth()
  const base = `/dashboard/${role ?? allowedDashboard ?? 'admin-produccion'}`
  const showOperacion = canViewResumen(employee)
  const showVentas = canViewVentasResumen(employee)
  const showPage = canViewResumenPage(employee)

  const resumenTabs = useMemo(() => buildResumenTabs(showOperacion, showVentas), [showOperacion, showVentas])
  const [activeTab, setActiveTab] = useState(() => resumenTabs[0]?.id ?? 'operacion')
  const [loading, setLoading] = useState(true)
  const [ventasLoading, setVentasLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [ventasErr, setVentasErr] = useState(null)
  const [pallets, setPallets] = useState([])
  const [guias, setGuias] = useState([])
  const [scanStats, setScanStats] = useState(null)
  const [proyectos, setProyectos] = useState([])
  const [seguimiento, setSeguimiento] = useState([])
  const [seguimientoObras, setSeguimientoObras] = useState([])
  const [seguimientoLoading, setSeguimientoLoading] = useState(false)
  const [seguimientoErr, setSeguimientoErr] = useState(null)
  const [seguimientoSince, setSeguimientoSince] = useState('2026-09-09')
  const [seguimientoLive, setSeguimientoLive] = useState(false)
  const [liveNonce, setLiveNonce] = useState(0)

  const roleNames = useMemo(
    () => (employee?.roles ?? []).map((r) => roleDisplayName(r.name)),
    [employee?.roles],
  )

  useEffect(() => {
    if (!showPage || activeTab !== 'seguimiento') return
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await systemApi.fetchSeguimientoConfig()
        const since = String(cfg?.seguimientoSince || '').trim()
        if (!cancelled && /^\d{4}-\d{2}-\d{2}$/.test(since)) {
          setSeguimientoSince(since)
        }
      } catch {
        /* mantiene default / valor actual */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showPage, activeTab])

  useEffect(() => {
    if (!resumenTabs.some((t) => t.id === activeTab)) {
      setActiveTab(resumenTabs[0]?.id ?? 'operacion')
    }
  }, [activeTab, resumenTabs])

  useEffect(() => {
    if (!showPage || !showOperacion) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const [pList, gList, stats] = await Promise.all([
          systemApi.listPallets(),
          systemApi.listGuias(),
          biesseApi.generalScanStats().catch(() => null),
        ])
        if (!cancelled) {
          setPallets(Array.isArray(pList) ? pList : [])
          setGuias(Array.isArray(gList) ? gList : [])
          setScanStats(stats && typeof stats === 'object' ? stats : null)
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'No se pudo cargar el resumen')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showPage, showOperacion])

  useEffect(() => {
    if (!showPage || !showVentas || activeTab !== 'ventas') return
    let cancelled = false
    ;(async () => {
      setVentasLoading(true)
      setVentasErr(null)
      try {
        const list = await systemApi.listProyectosOptimizacion({ scope: 'todos' })
        if (!cancelled) setProyectos(Array.isArray(list) ? list : [])
      } catch (e) {
        if (!cancelled) {
          setVentasErr(e instanceof Error ? e.message : 'No se pudieron cargar los proyectos')
        }
      } finally {
        if (!cancelled) setVentasLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showPage, showVentas, activeTab])

  const loadSeguimiento = useCallback(async () => {
    setSeguimientoLoading(true)
    setSeguimientoErr(null)
    try {
      const [proyectosBoard, obrasBoard] = await Promise.all([
        systemApi.listSeguimientoProyectosBoard(),
        systemApi.listObrasSeguimiento({ since: seguimientoSince }),
      ])
      setSeguimiento(Array.isArray(proyectosBoard) ? proyectosBoard : [])
      setSeguimientoObras(Array.isArray(obrasBoard) ? obrasBoard : [])
    } catch (e) {
      setSeguimientoErr(e instanceof Error ? e.message : 'No se pudo cargar el seguimiento')
    } finally {
      setSeguimientoLoading(false)
    }
  }, [seguimientoSince])

  useEffect(() => {
    if (!showPage || activeTab !== 'seguimiento') {
      setSeguimientoLive(false)
      return
    }

    let cancelled = false
    let reconnectTimer = null
    let refreshTimer = null
    let attempt = 0
    let didFallbackSnapshot = false
    const abort = new AbortController()

    const refreshBoard = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void (async () => {
          try {
            const [proyectosBoard, obrasBoard] = await Promise.all([
              systemApi.listSeguimientoProyectosBoard(),
              systemApi.listObrasSeguimiento({ since: seguimientoSince }),
            ])
            if (!cancelled) {
              setSeguimiento(Array.isArray(proyectosBoard) ? proyectosBoard : [])
              setSeguimientoObras(Array.isArray(obrasBoard) ? obrasBoard : [])
              setSeguimientoErr(null)
            }
          } catch (e) {
            if (!cancelled && !didFallbackSnapshot) {
              setSeguimientoErr(e instanceof Error ? e.message : 'No se pudo cargar el seguimiento')
            }
          } finally {
            if (!cancelled) setSeguimientoLoading(false)
          }
        })()
      }, 150)
    }

    const connect = async () => {
      if (cancelled) return
      setSeguimientoLoading(true)
      setSeguimientoErr(null)
      try {
        await systemApi.streamObrasSeguimiento({
          since: seguimientoSince,
          signal: abort.signal,
          onEvent: ({ event, data }) => {
            if (cancelled) return
            if (event === 'connected') {
              attempt = 0
              setSeguimientoLive(true)
              setSeguimientoErr(null)
              refreshBoard()
              return
            }
            if (event === 'snapshot' || event === 'update') {
              attempt = 0
              setSeguimientoLive(true)
              setSeguimientoErr(null)
              // El stream ya trae las obras Biesse; úsalas al instante.
              if (Array.isArray(data)) {
                setSeguimientoObras(data)
              }
              refreshBoard()
            }
          },
        })
      } catch (e) {
        if (cancelled || abort.signal.aborted) return
        setSeguimientoLive(false)
        attempt += 1
        if (!didFallbackSnapshot) {
          didFallbackSnapshot = true
          void loadSeguimiento()
        }
        const wait = Math.min(12_000, 2_000 * attempt)
        reconnectTimer = window.setTimeout(() => {
          void connect()
        }, wait)
        return
      }
      if (!cancelled && !abort.signal.aborted) {
        setSeguimientoLive(false)
        reconnectTimer = window.setTimeout(() => {
          void connect()
        }, 2_000)
      }
    }

    void connect()

    return () => {
      cancelled = true
      setSeguimientoLive(false)
      abort.abort()
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (refreshTimer) window.clearTimeout(refreshTimer)
    }
  }, [showPage, activeTab, seguimientoSince, loadSeguimiento, liveNonce])

  if (!showPage) {
    return (
      <Navigate
        to={defaultDashboardPath(allowedDashboard ?? role ?? 'admin-produccion', employee)}
        replace
      />
    )
  }

  const operacionBusy = loading && activeTab === 'operacion'
  const ventasBusy = ventasLoading && activeTab === 'ventas'

  return (
    <ModulePage>
      {resumenTabs.length > 1 ? (
        <div className="dash" style={{ paddingTop: '1rem' }}>
          <ModuleTabs
            tabs={resumenTabs}
            activeId={activeTab}
            onChange={setActiveTab}
            ariaLabel="Secciones del resumen"
          />
        </div>
      ) : null}

      {activeTab === 'operacion' && showOperacion ? (
        <>
          {err ? (
            <p className="form-error pad" role="alert">
              {err}
            </p>
          ) : null}
          {operacionBusy ? (
            <div className="app-loading" style={{ minHeight: '40vh' }}>
              <div className="app-loading__spinner" aria-hidden />
              <p className="text-sm">Cargando panel de resumen…</p>
            </div>
          ) : (
            <ResumenDashboard
              pallets={pallets}
              guias={guias}
              scanStats={scanStats}
              employee={employee}
              basePath={base}
              roleNames={roleNames}
            />
          )}
        </>
      ) : null}

      {activeTab === 'ventas' && showVentas ? (
        <>
          {ventasErr ? (
            <p className="form-error pad" role="alert">
              {ventasErr}
            </p>
          ) : null}
          {ventasBusy ? (
            <div className="app-loading" style={{ minHeight: '40vh' }}>
              <div className="app-loading__spinner" aria-hidden />
              <p className="text-sm">Cargando datos de ventas…</p>
            </div>
          ) : (
            <VentasAtencionDashboard proyectos={proyectos} basePath={base} employee={employee} />
          )}
        </>
      ) : null}

      {activeTab === 'seguimiento' ? (
        <>
          {seguimientoErr && !seguimientoLive ? (
            <p className="form-error pad" role="alert">
              {seguimientoErr}
            </p>
          ) : null}
          <SeguimientoBoard
            proyectos={seguimiento}
            obras={seguimientoObras}
            loading={seguimientoLoading}
            live={seguimientoLive}
            since={seguimientoSince}
            onReconnectLive={() => setLiveNonce((n) => n + 1)}
          />
        </>
      ) : null}
    </ModulePage>
  )
}
