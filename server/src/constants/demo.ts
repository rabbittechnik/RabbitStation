/** Lokale Demo-/Entwicklungsbasis – keine Echtdaten aus Neondeskaral/Produktion. */
export const DEMO_STATION_ID = 'demo-station-sued'

/** Alte Stations-ID aus der Ausgangs-App – Migrationen nur wenn diese Station noch existiert. */
export const LEGACY_REAL_STATION_ID = 'aral-bodelshausen'

export const DEMO_ADMIN_EMAIL = 'admin@demo-rabbitstation.local'
export const DEMO_ADMIN_USERNAME = 'admin'
/** Nur für lokale Entwicklung – in .env überschreibbar (DEMO_ADMIN_PASSWORD). */
export const DEMO_ADMIN_PASSWORD_DEFAULT = 'DemoRS2026!Local'

export const DEMO_STATION = {
  id: DEMO_STATION_ID,
  name: 'Demo Station Süd',
  brand: 'Demo',
  address: 'Musterstraße 1',
  city: 'Demostadt',
  postalCode: '12345',
  phone: '01234 / 567890',
  email: 'info@demo-station.de',
  federalState: 'BW',
} as const
