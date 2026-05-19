export type TuvReportStatus = 'draft' | 'in_progress' | 'completed' | 'printed'

export type TuvItemStatus = 'ok' | 'not_ok' | 'not_applicable' | ''

export type TuvDefectRow = {
  id: string
  position: string
  defectText: string
  doneByName: string
  dueUntil: string
  fixedAt: string
  fixedBySignature: string
}

export type TuvSignatureBlock = {
  name: string
  role: string
  date: string
  signatureDataUrl: string
}

export type TuvReportFormData = {
  defects: TuvDefectRow[]
  safetyCheck: TuvSignatureBlock
  hsseInspection: TuvSignatureBlock
  additionalNotes: string
}

export function emptyTuvFormData(): TuvReportFormData {
  return {
    defects: [],
    safetyCheck: { name: '', role: '', date: '', signatureDataUrl: '' },
    hsseInspection: { name: '', role: '', date: '', signatureDataUrl: '' },
    additionalNotes: '',
  }
}

export type TuvReportApi = {
  id: string
  stationId: string
  month: number
  year: number
  reportDate: string
  status: TuvReportStatus
  createdBy?: string
  createdByName: string
  inspectorRole: string
  weatherNote: string
  generalNote: string
  completedBy?: string
  completedByName: string
  completedAt?: string
  confirmedBy?: string
  confirmedByName: string
  confirmedAt?: string
  confirmationText: string
  signatureDataUrl: string
  printedAt?: string
  formData?: TuvReportFormData
  sourceTemplateDocumentId?: string
  createdAt: string
  updatedAt: string
}

export type TuvReportItemApi = {
  id: string
  reportId: string
  sortOrder: number
  category: string
  question: string
  status: TuvItemStatus
  note: string
  actionRequired: string
  responsible: string
  dueDate: string
  photoUrl: string
}

export type TuvReportDetail = { report: TuvReportApi; items: TuvReportItemApi[] }

export type TuvCurrentMonthCheck = {
  required: boolean
  disabled?: boolean
  month: number
  year: number
  status: 'missing' | 'in_progress' | 'completed' | 'printed' | 'disabled'
  reportId?: string
}
