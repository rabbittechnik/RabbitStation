declare global {
  namespace Express {
    interface Request {
      adminUser?: import('../services/authService.js').JwtPayload
      accessContext?: import('../services/stationAccessService.js').AccessContext
      supportSession?: import('../services/supportSessionService.js').SupportSessionRow
      /** Server-to-Server: Control Center mit CONTROL_CENTER_API_TOKEN */
      controlCenterApiAuth?: boolean
    }
  }
}

export {}
