import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { canViewBackupMenu, roleNamesFromEmployee } from '../auth/roles'
import * as systemApi from '../api/systemApi'

function formatBytes(bytes) {
  if (bytes == null || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatInstant(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function statusLabel(status) {
  if (status === 'SUCCESS') return 'Completado'
  if (status === 'FAILED') return 'Error'
  if (status === 'RUNNING') return 'En curso'
  return status ?? '—'
}

function restoreOriginLabel(triggerType) {
  if (triggerType === 'RESTORE_SYSTEM') return 'app_db'
  if (triggerType === 'RESTORE_BIESSE') return 'obras'
  if (triggerType === 'RESTORE_COMPLETE') return 'App completa'
  if (triggerType === 'RESTORE_UPLOAD_ZIP') return 'ZIP subido'
  if (triggerType === 'RESTORE_MEDIA') return 'Archivos (historial)'
  if (triggerType === 'RESTORE_MEDIA_UPLOAD') return 'Archivos (subido)'
  if (triggerType?.startsWith('RESTORE')) return 'Restauración'
  return triggerType ?? '—'
}

function backupOriginLabel(triggerType) {
  if (triggerType === 'MANUAL') return 'BD manual'
  if (triggerType === 'SCHEDULED') return 'BD programado'
  if (triggerType === 'MANUAL_FILES') return 'Archivos manual'
  return triggerType ?? '—'
}

function isMediaBackupFilename(name) {
  return Boolean(name?.startsWith('media_files_') && name.endsWith('.zip'))
}

function isCompleteBackupFilename(name) {
  return Boolean(name?.startsWith('allcenter_backup_') && name.endsWith('.zip'))
}

export function GestionBackupPanel() {
  const { employee } = useAuth()
  const canManage = canViewBackupMenu(roleNamesFromEmployee(employee))

  const [config, setConfig] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressStage, setProgressStage] = useState('')
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const [enabled, setEnabled] = useState(false)
  const [intervalHours, setIntervalHours] = useState(24)
  const [scheduledHour, setScheduledHour] = useState(3)
  const [saveToFolder, setSaveToFolder] = useState(true)
  const [sendByEmail, setSendByEmail] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')
  const [includeBiesseDb, setIncludeBiesseDb] = useState(true)
  const [includeMediaFiles, setIncludeMediaFiles] = useState(true)
  const [retentionCount, setRetentionCount] = useState(7)
  const [restoreHistory, setRestoreHistory] = useState([])
  const [restoreConfirm, setRestoreConfirm] = useState('')
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoreMediaConfirm, setRestoreMediaConfirm] = useState('')
  const [restoreMediaFile, setRestoreMediaFile] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [runningFiles, setRunningFiles] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [cfg, hist, restores] = await Promise.all([
        systemApi.fetchBackupConfig(),
        systemApi.fetchBackupHistory(),
        systemApi.fetchRestoreHistory(),
      ])
      setConfig(cfg)
      setHistory(hist ?? [])
      setRestoreHistory(restores ?? [])
      setEnabled(Boolean(cfg.enabled))
      setIntervalHours(cfg.intervalHours ?? 24)
      setScheduledHour(cfg.scheduledHour ?? 3)
      setSaveToFolder(cfg.saveToFolder !== false)
      setSendByEmail(Boolean(cfg.sendByEmail))
      setEmailRecipients(cfg.emailRecipients ?? '')
      setIncludeBiesseDb(cfg.includeBiesseDb !== false)
      setIncludeMediaFiles(cfg.includeMediaFiles !== false)
      setRetentionCount(cfg.retentionCount ?? 7)
    } catch (e) {
      setErr(e?.message ?? 'No se pudo cargar la configuración de backups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManage) {
      void load()
    } else {
      setLoading(false)
    }
  }, [canManage, load])

  async function submitConfig(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    setOk(null)
    try {
      const updated = await systemApi.updateBackupConfig({
        enabled,
        intervalHours: Number(intervalHours),
        scheduledHour: Number(scheduledHour),
        saveToFolder,
        sendByEmail,
        emailRecipients,
        includeBiesseDb,
        includeMediaFiles,
        retentionCount: Number(retentionCount),
      })
      setConfig(updated)
      setOk('Configuración guardada')
    } catch (e2) {
      setErr(e2?.message ?? 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function runBackupNow() {
    setRunning(true)
    setProgressPercent(0)
    setProgressStage('Guardando configuración…')
    setErr(null)
    setOk(null)
    try {
      await systemApi.updateBackupConfig({
        enabled,
        intervalHours: Number(intervalHours),
        scheduledHour: Number(scheduledHour),
        saveToFolder,
        sendByEmail,
        emailRecipients,
        includeBiesseDb,
        includeMediaFiles,
        retentionCount: Number(retentionCount),
      })
      const result = await systemApi.runBackupNowAndWait({
        onProgress: (run) => {
          setProgressPercent(run.progressPercent ?? 0)
          setProgressStage(run.progressStage || 'En curso…')
        },
      })
      if (result.message?.includes('Correo no enviado')) {
        setErr(result.message)
      } else {
        setOk(result.message || 'Backup ejecutado correctamente')
      }
      const hist = await systemApi.fetchBackupHistory()
      setHistory(hist ?? [])
      const cfg = await systemApi.fetchBackupConfig()
      setConfig(cfg)
    } catch (e) {
      const msg = e?.message ?? 'El backup falló'
      if (msg.includes('sigue en curso')) {
        setOk(msg)
      } else {
        setErr(msg)
      }
      const hist = await systemApi.fetchBackupHistory()
      setHistory(hist ?? [])
    } finally {
      setRunning(false)
      setProgressPercent(0)
      setProgressStage('')
    }
  }

  async function runMediaBackupNow() {
    setRunningFiles(true)
    setProgressPercent(0)
    setProgressStage('Comprimiendo archivos…')
    setErr(null)
    setOk(null)
    try {
      const result = await systemApi.runMediaBackupNowAndWait({
        onProgress: (run) => {
          setProgressPercent(run.progressPercent ?? 0)
          setProgressStage(run.progressStage || 'En curso…')
        },
      })
      setOk(result.message || 'Backup de archivos completado')
      const hist = await systemApi.fetchBackupHistory()
      setHistory(hist ?? [])
    } catch (e) {
      setErr(e?.message ?? 'El backup de archivos falló')
      const hist = await systemApi.fetchBackupHistory()
      setHistory(hist ?? [])
    } finally {
      setRunningFiles(false)
      setProgressPercent(0)
      setProgressStage('')
    }
  }

  async function restoreFromServer(runId, filename) {
    if (restoreConfirm.trim() !== 'RESTAURAR') {
      setErr('Escriba RESTAURAR para confirmar la restauración')
      return
    }
    if (!window.confirm(`¿Restaurar ${filename}? Esto SOBRESCRIBE datos actuales.`)) {
      return
    }
    setRestoring(true)
    setProgressPercent(0)
    setProgressStage('Iniciando restauración…')
    setErr(null)
    setOk(null)
    try {
      const started = await systemApi.restoreBackupFromHistory({
        confirmText: 'RESTAURAR',
        runId,
        filename,
      })
      const result = await systemApi.waitForBackupRun(started.id, {
        onProgress: (run) => {
          setProgressPercent(run.progressPercent ?? 0)
          setProgressStage(run.progressStage || 'Restaurando…')
        },
      })
      setOk(result.message || 'Restauración completada')
      const restores = await systemApi.fetchRestoreHistory()
      setRestoreHistory(restores ?? [])
    } catch (e) {
      setErr(e?.message ?? 'La restauración falló')
      const restores = await systemApi.fetchRestoreHistory()
      setRestoreHistory(restores ?? [])
    } finally {
      setRestoring(false)
      setProgressPercent(0)
      setProgressStage('')
      setRestoreConfirm('')
    }
  }

  async function restoreMediaFromServer(runId, filename) {
    if (restoreMediaConfirm.trim() !== 'RESTAURAR') {
      setErr('Escriba RESTAURAR para confirmar la restauración de archivos')
      return
    }
    if (!window.confirm(`¿Restaurar archivos desde ${filename}? Esto SOBRESCRIBE cotizaciones y fotos RM actuales.`)) {
      return
    }
    setRestoring(true)
    setProgressPercent(0)
    setProgressStage('Iniciando restauración de archivos…')
    setErr(null)
    setOk(null)
    try {
      const started = await systemApi.restoreMediaBackupFromHistory({
        confirmText: 'RESTAURAR',
        runId,
        filename,
      })
      const result = await systemApi.waitForBackupRun(started.id, {
        onProgress: (run) => {
          setProgressPercent(run.progressPercent ?? 0)
          setProgressStage(run.progressStage || 'Restaurando archivos…')
        },
      })
      setOk(result.message || 'Archivos restaurados')
      const restores = await systemApi.fetchRestoreHistory()
      setRestoreHistory(restores ?? [])
    } catch (e) {
      setErr(e?.message ?? 'La restauración de archivos falló')
      const restores = await systemApi.fetchRestoreHistory()
      setRestoreHistory(restores ?? [])
    } finally {
      setRestoring(false)
      setProgressPercent(0)
      setProgressStage('')
      setRestoreMediaConfirm('')
    }
  }

  async function restoreMediaFromUpload(e) {
    e.preventDefault()
    if (!restoreMediaFile) {
      setErr('Seleccione un archivo media_files_*.zip')
      return
    }
    if (restoreMediaConfirm.trim() !== 'RESTAURAR') {
      setErr('Escriba RESTAURAR para confirmar la restauración de archivos')
      return
    }
    if (!window.confirm('¿Restaurar archivos desde el ZIP subido? Esto SOBRESCRIBE cotizaciones y fotos RM.')) {
      return
    }
    setRestoring(true)
    setProgressPercent(0)
    setProgressStage('Subiendo archivo de medios…')
    setErr(null)
    setOk(null)
    try {
      const started = await systemApi.restoreMediaBackupUpload('RESTAURAR', restoreMediaFile)
      const result = await systemApi.waitForBackupRun(started.id, {
        onProgress: (run) => {
          setProgressPercent(run.progressPercent ?? 0)
          setProgressStage(run.progressStage || 'Restaurando archivos…')
        },
      })
      setOk(result.message || 'Archivos restaurados')
      setRestoreMediaFile(null)
      e.target.reset()
      const restores = await systemApi.fetchRestoreHistory()
      setRestoreHistory(restores ?? [])
    } catch (e2) {
      setErr(e2?.message ?? 'La restauración de archivos falló')
      const restores = await systemApi.fetchRestoreHistory()
      setRestoreHistory(restores ?? [])
    } finally {
      setRestoring(false)
      setProgressPercent(0)
      setProgressStage('')
      setRestoreMediaConfirm('')
    }
  }

  async function restoreFromUpload(e) {
    e.preventDefault()
    if (!restoreFile) {
      setErr('Seleccione un archivo .sql.gz o .zip')
      return
    }
    if (restoreConfirm.trim() !== 'RESTAURAR') {
      setErr('Escriba RESTAURAR para confirmar la restauración')
      return
    }
    if (!window.confirm('¿Restaurar desde archivo subido? Esto SOBRESCRIBE datos actuales.')) {
      return
    }
    setRestoring(true)
    setProgressPercent(0)
    setProgressStage('Subiendo archivo…')
    setErr(null)
    setOk(null)
    try {
      const started = await systemApi.restoreBackupUpload('RESTAURAR', restoreFile)
      const result = await systemApi.waitForBackupRun(started.id, {
        onProgress: (run) => {
          setProgressPercent(run.progressPercent ?? 0)
          setProgressStage(run.progressStage || 'Restaurando…')
        },
      })
      setOk(result.message || 'Restauración completada')
      setRestoreFile(null)
      e.target.reset()
      const restores = await systemApi.fetchRestoreHistory()
      setRestoreHistory(restores ?? [])
    } catch (e2) {
      setErr(e2?.message ?? 'La restauración falló')
      const restores = await systemApi.fetchRestoreHistory()
      setRestoreHistory(restores ?? [])
    } finally {
      setRestoring(false)
      setProgressPercent(0)
      setProgressStage('')
      setRestoreConfirm('')
    }
  }

  async function downloadFile(runId, filename) {
    setErr(null)
    try {
      await systemApi.downloadBackupFile(runId, filename)
    } catch (e) {
      setErr(e?.message ?? 'No se pudo descargar el archivo')
    }
  }

  if (!canManage) {
    return (
      <div className="card pad">
        <p className="muted">Solo el rol Master puede configurar backups.</p>
      </div>
    )
  }

  if (loading) {
    return <p className="muted pad">Cargando backups…</p>
  }

  return (
    <>
      <p className="muted small" style={{ marginBottom: '1rem' }}>
        Backup completo de la app: PostgreSQL (<code className="code-inline">app_db</code>
        {config?.biesseConfigured ? ' y obras' : ''}) más archivos en disco (cotizaciones y fotos RM).
        En <strong>old</strong> genere el backup, descargue <code className="code-inline">allcenter_backup_*.zip</code>
        y en <strong>new</strong> restáurelo (escribe RESTAURAR). Eso sobrescribe las bases del destino.
        Por defecto: cada 24 h a las 3:00. Los automáticos se revisan cada 15 minutos.
      </p>

      {config && !config.pgDumpAvailable ? (
        <div className="card pad" style={{ marginBottom: '1rem', borderColor: 'var(--warn, #c90)' }}>
          <p className="form-inline-error" style={{ margin: 0 }}>
            <strong>pg_dump no disponible</strong> en el contenedor del backend (no en el de Postgres).
            La base puede estar en otro recurso Coolify; igual hace falta{' '}
            <code className="code-inline">postgresql-client</code> en{' '}
            <code className="code-inline">allcenter-backend</code>. Reconstruya con Build Pack =
            Dockerfile (o Railpack con <code className="code-inline">railpack.json</code>) y
            redeploy. En logs busque: <code className="code-inline">Backup pg_dump:</code>.
          </p>
        </div>
      ) : null}

      <div className="card pad form-section">
        <h2>Configuración</h2>
        <form onSubmit={(e) => void submitConfig(e)}>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Backups automáticos activos</span>
          </label>

          <div className="form-row-2">
            <label className="field">
              <span>Intervalo (horas)</span>
              <input
                type="number"
                min={1}
                max={168}
                value={intervalHours}
                onChange={(e) => setIntervalHours(e.target.value)}
                required
              />
              <span className="muted small form-hint">
                24 h = diario; 168 h = semanal. Con 24 h o más, se usa la hora del día indicada.
              </span>
            </label>
            <label className="field">
              <span>Hora del día (0–23)</span>
              <input
                type="number"
                min={0}
                max={23}
                value={scheduledHour}
                onChange={(e) => setScheduledHour(e.target.value)}
                required
              />
            </label>
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '0.75rem 0' }}>
            <legend className="small" style={{ marginBottom: '0.35rem' }}>Destino</legend>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={saveToFolder}
                onChange={(e) => setSaveToFolder(e.target.checked)}
              />
              <span>Guardar en carpeta del servidor</span>
            </label>
            {config?.storageRoot ? (
              <p className="muted small form-hint">Ruta: {config.storageRoot}</p>
            ) : null}
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={sendByEmail}
                onChange={(e) => setSendByEmail(e.target.checked)}
                disabled={!config?.mailAvailable}
              />
              <span>Enviar por correo</span>
            </label>
            {!config?.mailAvailable ? (
              <p className="muted small form-hint">
                SMTP desactivado. Actívelo en <strong>Gestión → Configuración</strong> y pruebe el envío allí.
              </p>
            ) : (
              <p className="muted small form-hint">
                Use el mismo SMTP configurado en Gestión → Configuración. Guarde antes de generar el backup.
              </p>
            )}
          </fieldset>

          {sendByEmail ? (
            <label className="field">
              <span>Correos destino (separados por coma)</span>
              <input
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                placeholder="admin@empresa.com, respaldo@empresa.com"
              />
            </label>
          ) : null}

          <div className="form-row-2">
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={includeBiesseDb}
                onChange={(e) => setIncludeBiesseDb(e.target.checked)}
                disabled={!config?.biesseConfigured}
              />
              <span>Incluir base Biesse (obras)</span>
            </label>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={includeMediaFiles}
                onChange={(e) => setIncludeMediaFiles(e.target.checked)}
              />
              <span>Incluir cotizaciones y fotos RM</span>
            </label>
          </div>

          {config?.optimizacionMediaRoot || config?.rmMediaRoot ? (
            <p className="muted small form-hint">
              Incluido en backups automáticos y manuales de BD cuando está activo. Cotizaciones →{' '}
              {config.optimizacionMediaRoot || '—'} · RM → {config.rmMediaRoot || '—'}
            </p>
          ) : null}

          <div className="form-row-2">
            <label className="field">
              <span>Copias a conservar</span>
              <input
                type="number"
                min={1}
                max={100}
                value={retentionCount}
                onChange={(e) => setRetentionCount(e.target.value)}
                required
              />
            </label>
          </div>

          {config?.lastSuccessfulRunAt ? (
            <p className="muted small">
              Último backup exitoso: {formatInstant(config.lastSuccessfulRunAt)}
            </p>
          ) : null}

          {err ? <p className="form-inline-error">{err}</p> : null}
          {ok ? <p className="form-success">{ok}</p> : null}

          {running || runningFiles || restoring ? (
            <div style={{ marginTop: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginBottom: '0.35rem',
                  fontSize: '0.9rem',
                }}
              >
                <span>{progressStage || (restoring ? 'Restaurando…' : 'Generando backup…')}</span>
                <span className="muted">{progressPercent}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                style={{
                  height: '8px',
                  borderRadius: '999px',
                  background: 'var(--border, #e2e8f0)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(4, progressPercent)}%`,
                    background: 'var(--accent, #2563eb)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={saving || running || runningFiles || restoring}>
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={running || runningFiles || restoring || saving || !config?.pgDumpAvailable}
              onClick={() => void runBackupNow()}
            >
              {running
                ? `Generando backup… ${progressPercent > 0 ? `${progressPercent}%` : ''}`
                : 'Generar backup completo ahora'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={running || runningFiles || restoring || saving}
              onClick={() => void runMediaBackupNow()}
            >
              {runningFiles
                ? `Generando backup archivos… ${progressPercent > 0 ? `${progressPercent}%` : ''}`
                : 'Generar backup archivos ahora'}
            </button>
          </div>
        </form>
      </div>

      <div className="card card--table" style={{ marginTop: '1rem' }}>
        <h2 className="card__title pad">Historial</h2>
        {history.length === 0 ? (
          <p className="muted pad">Aún no hay backups registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Origen</th>
                  <th>Tamaño</th>
                  <th>Archivos</th>
                  <th>Correo</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td className="small">{formatInstant(row.startedAt)}</td>
                    <td>
                      <span className={row.status === 'FAILED' ? 'form-inline-error' : undefined}>
                        {statusLabel(row.status)}
                      </span>
                      {row.message ? (
                        <div className="muted small">{row.message}</div>
                      ) : null}
                    </td>
                    <td className="small">{backupOriginLabel(row.triggerType)}</td>
                    <td className="small">{formatBytes(row.totalBytes)}</td>
                    <td className="small">
                      {(row.files ?? []).length === 0
                        ? '—'
                        : row.files.map((f) =>
                            f.downloadable ? (
                              <span key={f.name} style={{ display: 'block', marginBottom: '0.35rem' }}>
                                <button
                                  type="button"
                                  className="linkish"
                                  style={{ textAlign: 'left' }}
                                  onClick={() => void downloadFile(row.id, f.name)}
                                >
                                  {f.name}
                                </button>
                                {isMediaBackupFilename(f.name) ? (
                                  <button
                                    type="button"
                                    className="btn btn--secondary"
                                    style={{ marginTop: '0.25rem', fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}
                                    disabled={restoring || running || runningFiles}
                                    onClick={() => void restoreMediaFromServer(row.id, f.name)}
                                  >
                                    Restaurar archivos
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn--secondary"
                                    style={{ marginTop: '0.25rem', fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}
                                    disabled={restoring || running || runningFiles}
                                    onClick={() => void restoreFromServer(row.id, f.name)}
                                  >
                                    {isCompleteBackupFilename(f.name)
                                      ? 'Restaurar app completa'
                                      : 'Restaurar BD'}
                                  </button>
                                )}
                              </span>
                            ) : (
                              <span key={f.name} className="muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
                                {f.name}
                                <div className="small">No está en disco (purgado o no guardado)</div>
                              </span>
                            ),
                          )}
                    </td>
                    <td className="small">
                      {row.emailed ? 'Sí' : 'No'}
                      {row.emailRecipientsSent ? (
                        <div className="muted small">→ {row.emailRecipientsSent}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card pad form-section" style={{ marginTop: '1rem', borderColor: 'var(--warn, #c90)' }}>
        <h2>Restaurar solo archivos</h2>
        <p className="muted small form-hint">
          Restaura cotizaciones y fotos RM desde <code className="code-inline">media_files_*.zip</code>.
          No modifica las bases de datos.
        </p>
        <form onSubmit={(e) => void restoreMediaFromUpload(e)}>
          <label className="field">
            <span>Archivo ZIP de archivos (media_files_*.zip)</span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setRestoreMediaFile(e.target.files?.[0] ?? null)}
              disabled={restoring || running || runningFiles}
            />
          </label>
          <label className="field">
            <span>Confirmación (escriba RESTAURAR)</span>
            <input
              value={restoreMediaConfirm}
              onChange={(e) => setRestoreMediaConfirm(e.target.value)}
              placeholder="RESTAURAR"
              disabled={restoring || running || runningFiles}
              autoComplete="off"
            />
          </label>
          <div className="form-actions">
            <button
              type="submit"
              className="btn btn--secondary"
              disabled={restoring || running || runningFiles || !restoreMediaFile}
            >
              {restoring ? `Restaurando archivos… ${progressPercent > 0 ? `${progressPercent}%` : ''}` : 'Restaurar archivos desde ZIP'}
            </button>
          </div>
        </form>
      </div>

      <div className="card pad form-section" style={{ marginTop: '1rem', borderColor: 'var(--warn, #c90)' }}>
        <h2>Restaurar backup de la app (old → new)</h2>
        <p className="muted small form-hint">
          <strong>Peligro:</strong> sobrescribe los datos actuales. Use en mantenimiento.
          Prefiera <code className="code-inline">allcenter_backup_*.zip</code> (bases + archivos).
          También acepta <code className="code-inline">app_db_*.sql.gz</code>,{' '}
          <code className="code-inline">obras_*.sql.gz</code> o el ZIP del correo.
          Tras restaurar, reinicie el backend new.
        </p>
        <form onSubmit={(e) => void restoreFromUpload(e)}>
          <label className="field">
            <span>Archivo local (allcenter_backup_*.zip, .sql.gz o ZIP)</span>
            <input
              type="file"
              accept=".sql.gz,.zip,application/gzip,application/zip"
              onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              disabled={restoring || running || runningFiles}
            />
          </label>
          <label className="field">
            <span>Confirmación (escriba RESTAURAR)</span>
            <input
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
              placeholder="RESTAURAR"
              disabled={restoring || running || runningFiles}
              autoComplete="off"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn--secondary" disabled={restoring || running || runningFiles || !restoreFile}>
              {restoring ? 'Restaurando…' : 'Restaurar app desde archivo'}
              {restoring && progressPercent > 0 ? ` ${progressPercent}%` : restoring ? ' (subiendo/procesando…)' : ''}
            </button>
          </div>
        </form>
      </div>

      <div className="card card--table" style={{ marginTop: '1rem' }}>
        <h2 className="card__title pad">Historial de restauraciones</h2>
        {restoreHistory.length === 0 ? (
          <p className="muted pad">Aún no hay restauraciones registradas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Origen</th>
                  <th>Archivo</th>
                </tr>
              </thead>
              <tbody>
                {restoreHistory.map((row) => (
                  <tr key={`restore-${row.id}`}>
                    <td className="small">{formatInstant(row.startedAt)}</td>
                    <td>
                      <span className={row.status === 'FAILED' ? 'form-inline-error' : undefined}>
                        {statusLabel(row.status)}
                      </span>
                      {row.message ? <div className="muted small">{row.message}</div> : null}
                    </td>
                    <td className="small">{restoreOriginLabel(row.triggerType)}</td>
                    <td className="small">{(row.files ?? []).map((f) => f.name).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
