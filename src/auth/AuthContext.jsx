import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as systemApi from '../api/systemApi'
import { AbilityProvider } from '../access/AbilityContext'
import {
  configureSystemExtraHeaders,
  configureTokenRefresh,
  getStoredTokens,
  refreshStoredSession,
  refreshSessionRequest,
  setStoredTokens,
  subscribeTokens,
} from '../api/http'
import { isAccessTokenExpired } from './jwtUtils'
import { clearAuthTokens, listenCrossTabAuthSync, loadAuthTokens, saveAuthTokens } from './tokenStorage'
import { defaultDashboardPath } from '../access/permissions'
import { dashboardForRoles } from './roles'

/** Renovar access token cuando falten estos segundos o menos para caducar. */
const REFRESH_SKEW_SECONDS = 90
const REFRESH_POLL_MS = 30_000

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null)
  const [ready, setReady] = useState(false)

  const refreshSession = useCallback(async () => {
    return refreshStoredSession()
  }, [])

  const logout = useCallback(async () => {
    const t = getStoredTokens()
    if (t?.refreshToken) {
      try {
        await systemApi.logout({ refreshToken: t.refreshToken })
      } catch {
        /* ignore */
      }
    }
    setStoredTokens(null)
    clearAuthTokens()
    setEmployee(null)
  }, [])

  useEffect(() => {
    configureTokenRefresh(async () => {
      const t = getStoredTokens()
      if (!t?.refreshToken) return null
      try {
        return await refreshSessionRequest({ refreshToken: t.refreshToken })
      } catch {
        return null
      }
    })
  }, [])

  useEffect(() => {
    const p = loadAuthTokens()
    if (p) {
      setStoredTokens({ accessToken: p.accessToken, refreshToken: p.refreshToken })
    } else {
      setStoredTokens(null)
    }

    let cancelled = false
    ;(async () => {
      if (!p) {
        if (!cancelled) setReady(true)
        return
      }
      if (isAccessTokenExpired(p.accessToken) && p.refreshToken) {
        const refreshed = await refreshSession()
        if (!refreshed) {
          setStoredTokens(null)
          saveAuthTokens(null)
          if (!cancelled) {
            setEmployee(null)
            setReady(true)
          }
          return
        }
        const next = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        }
        setStoredTokens(next)
        saveAuthTokens(next)
      }
      // Si esto falla, `backendJson` ya intentó renovar por dentro antes de
      // propagar el error: reintentar aquí solo repetiría el mismo refresh fallido.
      try {
        const me = await systemApi.fetchMe()
        if (!cancelled) setEmployee(me)
      } catch {
        setStoredTokens(null)
        saveAuthTokens(null)
        if (!cancelled) setEmployee(null)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [refreshSession])

  useEffect(() => {
    return subscribeTokens((t) => {
      if (t) saveAuthTokens({ accessToken: t.accessToken, refreshToken: t.refreshToken })
      else saveAuthTokens(null)
    })
  }, [])

  useEffect(() => {
    return listenCrossTabAuthSync((t) => {
      if (t) {
        setStoredTokens({ accessToken: t.accessToken, refreshToken: t.refreshToken })
      } else {
        setStoredTokens(null)
        setEmployee(null)
      }
    })
  }, [])

  useEffect(() => {
    configureSystemExtraHeaders(() => {
      if (!employee) return {}
      const h = {}
      if (employee.id) {
        h['X-Actor-Employee-Id'] = String(employee.id)
      }
      const email = employee.email && String(employee.email).trim()
      if (email) {
        // Solo X-Actor-Email (CORS). Inventario/pallets aceptan también este header.
        h['X-Actor-Email'] = email
      }
      return h
    })
  }, [employee])

/** Renovación proactiva del access token mientras haya refresh token válido. */
  useEffect(() => {
    if (!employee) return undefined

    const tick = async () => {
      const t = getStoredTokens()
      if (!t?.refreshToken) return

      const shouldRefresh =
        !t.accessToken || isAccessTokenExpired(t.accessToken, REFRESH_SKEW_SECONDS)

      if (!shouldRefresh) return

      const refreshed = await refreshSession()
      if (refreshed) {
        setStoredTokens({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        })
        saveAuthTokens({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        })
        return
      }

      // El backend rechazó el refresh token (400): no hay nada que esperar, la
      // sesión ya está muerta. Antes se esperaba a que el access token también
      // expirara (hasta ~90s), dejando cada pantalla fallando en silencio mientras tanto.
      await logout()
    }

    const id = window.setInterval(() => void tick(), REFRESH_POLL_MS)
    void tick()

    return () => {
      clearInterval(id)
    }
  }, [employee, refreshSession, logout])

  const allowedDashboard = useMemo(
    () => (employee ? dashboardForRoles(employee.roles.map((r) => r.name)) : null),
    [employee],
  )

  const login = useCallback(async (username, password) => {
    const session = await systemApi.login({ username, password })
    setStoredTokens({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    })
    saveAuthTokens({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    })
    setEmployee(session.employee)
    const dash = dashboardForRoles(session.employee.roles.map((r) => r.name))
    if (!dash) {
      await systemApi.logout({ refreshToken: session.refreshToken })
      setStoredTokens(null)
      saveAuthTokens(null)
      setEmployee(null)
      throw new Error(
        'Tu cuenta no tiene un rol permitido en el portal. Contacta al administrador de sistemas.',
      )
    }
    return defaultDashboardPath(dash, session.employee)
  }, [])

  const reloadMe = useCallback(async () => {
    const me = await systemApi.fetchMe()
    setEmployee(me)
  }, [])

  const value = useMemo(
    () => ({
      employee,
      ready,
      login,
      logout,
      reloadMe,
      allowedDashboard,
    }),
    [employee, ready, login, logout, reloadMe, allowedDashboard],
  )

  return (
    <AuthContext.Provider value={value}>
      <AbilityProvider employee={employee}>{children}</AbilityProvider>
    </AuthContext.Provider>
  )
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
