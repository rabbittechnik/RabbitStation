import cors from 'cors'
import express from 'express'
import { adminApiGate } from './middleware/adminApiGate.js'
import { stationsRouter } from './routes/stations.routes.js'
import { employeesRouter } from './routes/employees.routes.js'
import { workAreasRouter } from './routes/workAreas.routes.js'
import { shiftsRouter } from './routes/shifts.routes.js'
import { absencesRouter } from './routes/absences.routes.js'
import { vacationBlocksRouter } from './routes/vacationBlocks.routes.js'
import { tasksRouter, taskLogsRouter } from './routes/tasks.routes.js'
import { taskTemplatesRouter } from './routes/taskTemplates.routes.js'
import { timeEntriesRouter, terminalRouter } from './routes/timeTracking.routes.js'
import { tabletRouter } from './routes/tablet.routes.js'
import { fuelPricesRouter } from './routes/fuelPrices.routes.js'
import { devRouter } from './routes/dev.routes.js'
import { authRouter } from './routes/auth.routes.js'
import { employeeAccessRouter } from './routes/employeeAccess.routes.js'
import { employeeAppAdminRouter } from './routes/employeeAppAdmin.routes.js'
import { scheduleAssistantRouter } from './routes/scheduleAssistant.routes.js'
import { accessRouter } from './routes/access.routes.js'
import { tuvReportsRouter } from './routes/tuvReports.routes.js'
import { notificationsRouter } from './routes/notifications.routes.js'
import { reportsRouter } from './routes/reports.routes.js'
import { stationTabletsRouter } from './routes/stationTablets.routes.js'
import { representativesRouter } from './routes/representatives.routes.js'
import { documentsRouter } from './routes/documents.routes.js'
import { minimumWageRouter } from './routes/minimumWage.routes.js'
import { backshopRoutinesRouter } from './routes/backshop.routes.js'
import { stationExtraHolidaysRouter } from './routes/stationExtraHolidays.routes.js'
import { stationHubRouter } from './routes/stationHub.routes.js'
import { publicRouter } from './routes/public.routes.js'
import { tenantRouter } from './routes/tenant.routes.js'
import { setupRouter } from './routes/setup.routes.js'
import { platformAdminRouter } from './routes/platformAdmin.routes.js'
import { supportPublicRouter } from './routes/support.routes.js'
import { attachClientStatic } from './attachClientStatic.js'

function parseCorsOrigins(): boolean | string[] {
  const origins = new Set<string>()
  const clientOrigin = process.env.CLIENT_ORIGIN?.trim()
  const publicApp = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (clientOrigin && clientOrigin !== '*') {
    for (const o of clientOrigin.split(',')) {
      const t = o.trim()
      if (t) origins.add(t)
    }
  }
  if (publicApp) origins.add(publicApp)
  if (origins.size === 0) return true
  return [...origins]
}

export function createApp() {
  const app = express()
  app.use(
    cors({
      origin: parseCorsOrigins(),
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'RabbitStation Haupt-App',
      product: process.env.APP_NAME ?? 'RabbitStation Pro',
      time: new Date().toISOString(),
    })
  })

  app.use('/api/public', publicRouter)
  app.use(adminApiGate)
  app.use('/api/support', supportPublicRouter)

  app.use('/api/auth', authRouter)
  app.use('/api/tenant', tenantRouter)
  app.use('/api/setup', setupRouter)
  app.use('/api/admin', platformAdminRouter)
  app.use('/api/employee-access', employeeAccessRouter)
  app.use('/api/terminal', terminalRouter)
  app.use('/api/tablet', tabletRouter)
  app.use('/api/fuel-prices', fuelPricesRouter)

  app.use('/api/schedule-assistant', scheduleAssistantRouter)
  app.use('/api/tuv-reports', tuvReportsRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/access', accessRouter)
  app.use('/api/stations', stationsRouter)
  app.use('/api/employees', employeesRouter)
  app.use('/api/employee-app', employeeAppAdminRouter)
  app.use('/api/work-areas', workAreasRouter)
  app.use('/api/shifts', shiftsRouter)
  app.use('/api/absences', absencesRouter)
  app.use('/api/vacation-blocks', vacationBlocksRouter)
  app.use('/api/tasks', tasksRouter)
  app.use('/api/task-logs', taskLogsRouter)
  app.use('/api/task-templates', taskTemplatesRouter)
  app.use('/api/time-entries', timeEntriesRouter)
  app.use('/api/reports', reportsRouter)
  app.use('/api/station-tablets', stationTabletsRouter)
  app.use('/api/representatives', representativesRouter)
  app.use('/api/documents', documentsRouter)
  app.use('/api/minimum-wage-rates', minimumWageRouter)
  app.use('/api/backshop-routines', backshopRoutinesRouter)
  app.use('/api/station-extra-holidays', stationExtraHolidaysRouter)
  app.use('/api/station-hub', stationHubRouter)
  app.use('/api/dev', devRouter)

  if (process.env.SERVE_CLIENT_STATIC === '1' || process.env.NODE_ENV === 'production') {
    attachClientStatic(app)
  }

  app.use((req, res) => {
    const p = (req.originalUrl ?? req.url ?? '').split('?')[0] || req.path
    if (p.startsWith('/api')) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'API route not found',
      })
    }
    res.status(404).json({ ok: false, error: 'Nicht gefunden' })
  })

  return app
}
