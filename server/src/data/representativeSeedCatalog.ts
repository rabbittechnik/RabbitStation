/** Neutrale Demo-Vertreter – keine echten Firmen oder Personen. */
export type RepresentativeSeedEntry = {
  seedKey: string
  company: string
  name: string
  position: string
  category: string
  street: string
  houseNumber: string
  postCode: string
  city: string
  postalAddress: string
  phone: string
  mobile1: string
  mobile2: string
  fax: string
  email: string
  website: string
  notes: string
  isFavorite: boolean
}

export const DEMO_REPRESENTATIVE_SEEDS: RepresentativeSeedEntry[] = [
  {
    seedKey: 'demo-tabak-lieferant',
    company: 'Demo Tabak Großhandel GmbH',
    name: 'Kontakt Vertrieb',
    position: 'Außendienst',
    category: 'Tabak',
    street: 'Industriestraße',
    houseNumber: '12',
    postCode: '12345',
    city: 'Demostadt',
    postalAddress: '',
    phone: '01234 567890',
    mobile1: '',
    mobile2: '',
    fax: '',
    email: 'vertrieb@demo-tabak.example',
    website: 'https://example.demo/tabak',
    notes: 'Demo-Lieferant Tabak',
    isFavorite: false,
  },
  {
    seedKey: 'demo-getraenke',
    company: 'Demo Getränke Service',
    name: 'Service Hotline',
    position: 'Kundenservice',
    category: 'Getränke',
    street: 'Logistikweg',
    houseNumber: '3',
    postCode: '12346',
    city: 'Demostadt',
    postalAddress: '',
    phone: '01234 567891',
    mobile1: '',
    mobile2: '',
    fax: '',
    email: 'service@demo-getraenke.example',
    website: '',
    notes: 'Demo-Lieferant Getränke',
    isFavorite: true,
  },
  {
    seedKey: 'demo-wartung',
    company: 'Demo Technik Wartung',
    name: 'Technischer Support',
    position: 'Wartung',
    category: 'Technik',
    street: 'Servicering',
    houseNumber: '7',
    postCode: '12347',
    city: 'Demostadt',
    postalAddress: '',
    phone: '01234 567892',
    mobile1: '0170 0000000',
    mobile2: '',
    fax: '',
    email: 'support@demo-technik.example',
    website: 'https://example.demo/technik',
    notes: 'Demo-Wartung Wasch / Technik',
    isFavorite: false,
  },
]

/** @deprecated Nur für Legacy-Code – nutze DEMO_REPRESENTATIVE_SEEDS */
export const ARAL_BODELSHAUSEN_REPRESENTATIVE_SEEDS = DEMO_REPRESENTATIVE_SEEDS
