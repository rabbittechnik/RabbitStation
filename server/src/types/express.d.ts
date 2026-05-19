declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        sub: string
        username: string
        displayName: string
        roleId: string
      }
      accessContext?: import('../services/stationAccessService.js').AccessContext
      /** Server-to-Server: Control Center mit CONTROL_CENTER_API_TOKEN */
      controlCenterApiAuth?: boolean
    }
  }
}

export {}
