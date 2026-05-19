import cron from 'node-cron'
import { getBackupScheduleCron, isBackupEnabled } from '../config/backupConfig.js'
import { createBackup } from './backupService.js'

let started = false
let running = false

export function startBackupScheduler(): void {
  if (started) return
  started = true

  if (!isBackupEnabled()) {
    console.log('[backup:scheduler] Automatisches Backup deaktiviert (BACKUP_ENABLED=false)')
    return
  }

  const expr = getBackupScheduleCron()
  if (!cron.validate(expr)) {
    console.error(`[backup:scheduler] Ungültiger BACKUP_SCHEDULE_CRON: ${expr}`)
    return
  }

  cron.schedule(expr, () => {
    if (running) {
      console.warn('[backup:scheduler] Vorheriger Lauf noch aktiv – übersprungen')
      return
    }
    running = true
    void (async () => {
      try {
        console.info('[backup:scheduler] Starte geplantes Backup…')
        await createBackup({ type: 'scheduled' })
      } catch (e) {
        console.error('[backup:scheduler] Fehlgeschlagen:', e instanceof Error ? e.message : e)
      } finally {
        running = false
      }
    })()
  })

  console.info(`[backup:scheduler] Aktiv (${expr})`)
}
