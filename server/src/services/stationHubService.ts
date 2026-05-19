import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getBillingDocumentsDir } from '../config/dataPaths.js'
import { nowIso } from '../utils/timestamps.js'

/* ——— Announcements ——— */
export function listAnnouncements(db: Database, stationId: string, q?: string, includeArchived?: boolean) {
  let sql = `SELECT * FROM station_announcements WHERE station_id = ?`
  const p: (string | number)[] = [stationId]
  if (!includeArchived) sql += ` AND (archived_at IS NULL OR trim(archived_at) = '') AND active = 1`
  if (q?.trim()) {
    sql += ` AND (lower(title) LIKE ? OR lower(body) LIKE ?)`
    const t = `%${q.trim().toLowerCase()}%`
    p.push(t, t)
  }
  sql += ` ORDER BY created_at DESC`
  return db.prepare(sql).all(...p) as Record<string, unknown>[]
}

export function upsertAnnouncement(db: Database, stationId: string, body: Record<string, unknown>, uid?: string | null) {
  const id = String(body.id ?? '').trim() || `ann-${randomUUID()}`
  const ts = nowIso()
  const exists = db.prepare(`SELECT id FROM station_announcements WHERE id = ?`).get(id)
  if (!exists) {
    db.prepare(
      `INSERT INTO station_announcements (id, station_id, title, body, audience, priority, valid_from, valid_to, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      id,
      stationId,
      String(body.title ?? '').trim() || 'Mitteilung',
      String(body.body ?? ''),
      String(body.audience ?? 'all'),
      String(body.priority ?? 'normal'),
      body.validFrom != null ? String(body.validFrom) : null,
      body.validTo != null ? String(body.validTo) : null,
      uid ?? null,
      ts,
      ts,
    )
  } else {
    db.prepare(
      `UPDATE station_announcements SET
        title = COALESCE(?, title), body = COALESCE(?, body), audience = COALESCE(?, audience), priority = COALESCE(?, priority),
        valid_from = COALESCE(?, valid_from), valid_to = COALESCE(?, valid_to), active = COALESCE(?, active), updated_at = ?
      WHERE id = ? AND station_id = ?`,
    ).run(
      body.title != null ? String(body.title) : null,
      body.body != null ? String(body.body) : null,
      body.audience != null ? String(body.audience) : null,
      body.priority != null ? String(body.priority) : null,
      body.validFrom !== undefined ? (body.validFrom == null ? null : String(body.validFrom)) : null,
      body.validTo !== undefined ? (body.validTo == null ? null : String(body.validTo)) : null,
      body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
      ts,
      id,
      stationId,
    )
  }
  return db.prepare(`SELECT * FROM station_announcements WHERE id = ?`).get(id)
}

export function archiveAnnouncement(db: Database, stationId: string, id: string) {
  const ts = nowIso()
  db.prepare(`UPDATE station_announcements SET active = 0, archived_at = ?, updated_at = ? WHERE id = ? AND station_id = ?`).run(
    ts,
    ts,
    id,
    stationId,
  )
}

/* ——— Chat groups ——— */
export function listChatGroups(db: Database, stationId: string, q?: string, includeArchived?: boolean) {
  let sql = `SELECT g.*, (SELECT COUNT(*) FROM station_chat_group_members m WHERE m.group_id = g.id) as member_count
    FROM station_chat_groups g WHERE g.station_id = ?`
  const p: (string | number)[] = [stationId]
  if (!includeArchived) sql += ` AND (g.archived_at IS NULL OR trim(g.archived_at) = '') AND g.active = 1`
  if (q?.trim()) {
    sql += ` AND lower(g.name) LIKE ?`
    p.push(`%${q.trim().toLowerCase()}%`)
  }
  sql += ` ORDER BY g.name`
  return db.prepare(sql).all(...p) as Record<string, unknown>[]
}

export function upsertChatGroup(db: Database, stationId: string, body: Record<string, unknown>, uid?: string | null) {
  const id = String(body.id ?? '').trim() || `cg-${randomUUID()}`
  const ts = nowIso()
  const exists = db.prepare(`SELECT id FROM station_chat_groups WHERE id = ?`).get(id)
  if (!exists) {
    db.prepare(
      `INSERT INTO station_chat_groups (id, station_id, name, description, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      id,
      stationId,
      String(body.name ?? '').trim() || 'Gruppe',
      body.description != null ? String(body.description) : null,
      uid ?? null,
      ts,
      ts,
    )
  } else {
    db.prepare(
      `UPDATE station_chat_groups SET name = COALESCE(?, name), description = COALESCE(?, description), active = COALESCE(?, active), updated_at = ?
       WHERE id = ? AND station_id = ?`,
    ).run(
      body.name != null ? String(body.name) : null,
      body.description !== undefined ? (body.description == null ? null : String(body.description)) : null,
      body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
      ts,
      id,
      stationId,
    )
  }
  if (Array.isArray(body.memberEmployeeIds)) {
    db.prepare(`DELETE FROM station_chat_group_members WHERE group_id = ?`).run(id)
    const ins = db.prepare(
      `INSERT INTO station_chat_group_members (group_id, employee_id, role, created_at) VALUES (?, ?, ?, ?)`,
    )
    for (const eid of body.memberEmployeeIds as string[]) {
      const e = String(eid ?? '').trim()
      if (!e) continue
      ins.run(id, e, 'member', ts)
    }
  }
  return db.prepare(`SELECT * FROM station_chat_groups WHERE id = ?`).get(id)
}

export function archiveChatGroup(db: Database, stationId: string, id: string) {
  const ts = nowIso()
  db.prepare(`UPDATE station_chat_groups SET active = 0, archived_at = ?, updated_at = ? WHERE id = ? AND station_id = ?`).run(
    ts,
    ts,
    id,
    stationId,
  )
}

export function listChatGroupMembers(db: Database, groupId: string) {
  return db.prepare(`SELECT employee_id as employeeId, role FROM station_chat_group_members WHERE group_id = ?`).all(groupId) as {
    employeeId: string
    role: string | null
  }[]
}

/* ——— Lists ——— */
export function listOrgLists(db: Database, stationId: string, category?: string, q?: string, includeArchived?: boolean) {
  let sql = `SELECT * FROM station_org_lists WHERE station_id = ?`
  const p: (string | number)[] = [stationId]
  if (!includeArchived) sql += ` AND (archived_at IS NULL OR trim(archived_at) = '') AND active = 1`
  if (category?.trim()) {
    sql += ` AND lower(trim(category)) = lower(trim(?))`
    p.push(category.trim())
  }
  if (q?.trim()) {
    sql += ` AND (lower(title) LIKE ? OR lower(description) LIKE ?)`
    const t = `%${q.trim().toLowerCase()}%`
    p.push(t, t)
  }
  sql += ` ORDER BY title`
  return db.prepare(sql).all(...p) as Record<string, unknown>[]
}

export function upsertOrgList(db: Database, stationId: string, body: Record<string, unknown>, uid?: string | null) {
  const id = String(body.id ?? '').trim() || `list-${randomUUID()}`
  const ts = nowIso()
  const exists = db.prepare(`SELECT id FROM station_org_lists WHERE id = ?`).get(id)
  if (!exists) {
    db.prepare(
      `INSERT INTO station_org_lists (id, station_id, title, category, description, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      id,
      stationId,
      String(body.title ?? '').trim() || 'Liste',
      body.category != null ? String(body.category) : null,
      body.description != null ? String(body.description) : null,
      uid ?? null,
      ts,
      ts,
    )
  } else {
    db.prepare(
      `UPDATE station_org_lists SET title = COALESCE(?, title), category = COALESCE(?, category), description = COALESCE(?, description),
        active = COALESCE(?, active), updated_at = ? WHERE id = ? AND station_id = ?`,
    ).run(
      body.title != null ? String(body.title) : null,
      body.category !== undefined ? (body.category == null ? null : String(body.category)) : null,
      body.description !== undefined ? (body.description == null ? null : String(body.description)) : null,
      body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
      ts,
      id,
      stationId,
    )
  }
  return db.prepare(`SELECT * FROM station_org_lists WHERE id = ?`).get(id)
}

export function listOrgListItems(db: Database, listId: string) {
  return db
    .prepare(`SELECT * FROM station_org_list_items WHERE list_id = ? ORDER BY sort_order, text`)
    .all(listId) as Record<string, unknown>[]
}

export function upsertOrgListItem(db: Database, listId: string, body: Record<string, unknown>) {
  const id = String(body.id ?? '').trim() || `li-${randomUUID()}`
  const ts = nowIso()
  const exists = db.prepare(`SELECT id FROM station_org_list_items WHERE id = ?`).get(id)
  if (!exists) {
    const sort = body.sortOrder != null && Number.isFinite(Number(body.sortOrder)) ? Math.floor(Number(body.sortOrder)) : 0
    db.prepare(
      `INSERT INTO station_org_list_items (id, list_id, text, sort_order, mandatory, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      listId,
      String(body.text ?? '').trim() || 'Punkt',
      sort,
      body.mandatory === true || Number(body.mandatory) === 1 ? 1 : 0,
      ts,
      ts,
    )
  } else {
    db.prepare(
      `UPDATE station_org_list_items SET text = COALESCE(?, text), sort_order = COALESCE(?, sort_order),
        mandatory = COALESCE(?, mandatory), active = COALESCE(?, active), updated_at = ? WHERE id = ? AND list_id = ?`,
    ).run(
      body.text != null ? String(body.text) : null,
      body.sortOrder != null && Number.isFinite(Number(body.sortOrder)) ? Math.floor(Number(body.sortOrder)) : null,
      body.mandatory != null ? (body.mandatory === true || Number(body.mandatory) === 1 ? 1 : 0) : null,
      body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
      ts,
      id,
      listId,
    )
  }
  return db.prepare(`SELECT * FROM station_org_list_items WHERE id = ?`).get(id)
}

/* ——— Calendar ——— */
export function listCalendarEvents(db: Database, stationId: string, from?: string, to?: string, category?: string) {
  let sql = `SELECT * FROM station_calendar_events WHERE station_id = ? AND (archived_at IS NULL OR trim(archived_at) = '') AND active = 1`
  const p: string[] = [stationId]
  if (from?.trim()) {
    sql += ` AND date >= ?`
    p.push(from.trim())
  }
  if (to?.trim()) {
    sql += ` AND date <= ?`
    p.push(to.trim())
  }
  if (category?.trim()) {
    sql += ` AND lower(trim(category)) = lower(trim(?))`
    p.push(category.trim())
  }
  sql += ` ORDER BY date, time_from`
  return db.prepare(sql).all(...p) as Record<string, unknown>[]
}

export function upsertCalendarEvent(db: Database, stationId: string, body: Record<string, unknown>, uid?: string | null) {
  const id = String(body.id ?? '').trim() || `cal-${randomUUID()}`
  const ts = nowIso()
  const attendees = Array.isArray(body.attendeeEmployeeIds) ? (body.attendeeEmployeeIds as string[]) : []
  const exists = db.prepare(`SELECT id FROM station_calendar_events WHERE id = ?`).get(id)
  if (!exists) {
    db.prepare(
      `INSERT INTO station_calendar_events (id, station_id, title, description, date, time_from, time_to, all_day, category, repeat_rule, reminder_minutes, attendee_employee_ids_json, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      id,
      stationId,
      String(body.title ?? '').trim() || 'Termin',
      body.description != null ? String(body.description) : null,
      String(body.date ?? ''),
      body.timeFrom != null ? String(body.timeFrom) : null,
      body.timeTo != null ? String(body.timeTo) : null,
      body.allDay === true || Number(body.allDay) === 1 ? 1 : 0,
      body.category != null ? String(body.category) : null,
      body.repeatRule != null ? String(body.repeatRule) : null,
      body.reminderMinutes != null && Number.isFinite(Number(body.reminderMinutes)) ? Math.floor(Number(body.reminderMinutes)) : null,
      JSON.stringify(attendees),
      uid ?? null,
      ts,
      ts,
    )
  } else {
    db.prepare(
      `UPDATE station_calendar_events SET title = COALESCE(?, title), description = COALESCE(?, description), date = COALESCE(?, date),
        time_from = COALESCE(?, time_from), time_to = COALESCE(?, time_to), all_day = COALESCE(?, all_day), category = COALESCE(?, category),
        repeat_rule = COALESCE(?, repeat_rule), reminder_minutes = COALESCE(?, reminder_minutes),
        attendee_employee_ids_json = COALESCE(?, attendee_employee_ids_json), active = COALESCE(?, active), updated_at = ?
      WHERE id = ? AND station_id = ?`,
    ).run(
      body.title != null ? String(body.title) : null,
      body.description !== undefined ? (body.description == null ? null : String(body.description)) : null,
      body.date != null ? String(body.date) : null,
      body.timeFrom !== undefined ? (body.timeFrom == null ? null : String(body.timeFrom)) : null,
      body.timeTo !== undefined ? (body.timeTo == null ? null : String(body.timeTo)) : null,
      body.allDay != null ? (body.allDay === true || Number(body.allDay) === 1 ? 1 : 0) : null,
      body.category !== undefined ? (body.category == null ? null : String(body.category)) : null,
      body.repeatRule !== undefined ? (body.repeatRule == null ? null : String(body.repeatRule)) : null,
      body.reminderMinutes !== undefined
        ? body.reminderMinutes == null
          ? null
          : Math.floor(Number(body.reminderMinutes))
        : null,
      body.attendeeEmployeeIds != null ? JSON.stringify(body.attendeeEmployeeIds) : null,
      body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
      ts,
      id,
      stationId,
    )
  }
  return db.prepare(`SELECT * FROM station_calendar_events WHERE id = ?`).get(id)
}

/* ——— Contacts ——— */
export function listOrgContacts(db: Database, stationId: string, q?: string, includeArchived?: boolean) {
  let sql = `SELECT * FROM station_org_contacts WHERE station_id = ?`
  const p: (string | number)[] = [stationId]
  if (!includeArchived) sql += ` AND (archived_at IS NULL OR trim(archived_at) = '') AND active = 1`
  if (q?.trim()) {
    sql += ` AND (lower(name) LIKE ? OR lower(company) LIKE ? OR lower(email) LIKE ?)`
    const t = `%${q.trim().toLowerCase()}%`
    p.push(t, t, t)
  }
  sql += ` ORDER BY lower(name)`
  return db.prepare(sql).all(...p) as Record<string, unknown>[]
}

export function upsertOrgContact(db: Database, stationId: string, body: Record<string, unknown>) {
  const id = String(body.id ?? '').trim() || `c-${randomUUID()}`
  const ts = nowIso()
  const exists = db.prepare(`SELECT id FROM station_org_contacts WHERE id = ?`).get(id)
  if (!exists) {
    db.prepare(
      `INSERT INTO station_org_contacts (id, station_id, name, company, role_label, email, phone, mobile, fax, address, note, category, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      stationId,
      String(body.name ?? '').trim() || 'Kontakt',
      body.company != null ? String(body.company) : null,
      body.roleLabel != null ? String(body.roleLabel) : null,
      body.email != null ? String(body.email) : null,
      body.phone != null ? String(body.phone) : null,
      body.mobile != null ? String(body.mobile) : null,
      body.fax != null ? String(body.fax) : null,
      body.address != null ? String(body.address) : null,
      body.note != null ? String(body.note) : null,
      body.category != null ? String(body.category) : null,
      ts,
      ts,
    )
  } else {
    db.prepare(
      `UPDATE station_org_contacts SET name = COALESCE(?, name), company = COALESCE(?, company), role_label = COALESCE(?, role_label),
        email = COALESCE(?, email), phone = COALESCE(?, phone), mobile = COALESCE(?, mobile), fax = COALESCE(?, fax),
        address = COALESCE(?, address), note = COALESCE(?, note), category = COALESCE(?, category), active = COALESCE(?, active), updated_at = ?
      WHERE id = ? AND station_id = ?`,
    ).run(
      body.name != null ? String(body.name) : null,
      body.company !== undefined ? (body.company == null ? null : String(body.company)) : null,
      body.roleLabel !== undefined ? (body.roleLabel == null ? null : String(body.roleLabel)) : null,
      body.email !== undefined ? (body.email == null ? null : String(body.email)) : null,
      body.phone !== undefined ? (body.phone == null ? null : String(body.phone)) : null,
      body.mobile !== undefined ? (body.mobile == null ? null : String(body.mobile)) : null,
      body.fax !== undefined ? (body.fax == null ? null : String(body.fax)) : null,
      body.address !== undefined ? (body.address == null ? null : String(body.address)) : null,
      body.note !== undefined ? (body.note == null ? null : String(body.note)) : null,
      body.category !== undefined ? (body.category == null ? null : String(body.category)) : null,
      body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
      ts,
      id,
      stationId,
    )
  }
  return db.prepare(`SELECT * FROM station_org_contacts WHERE id = ?`).get(id)
}

/* ——— Meters ——— */
export function listMeters(db: Database, stationId: string, includeArchived?: boolean) {
  let sql = `SELECT * FROM station_meters WHERE station_id = ?`
  if (!includeArchived) sql += ` AND (archived_at IS NULL OR trim(archived_at) = '') AND active = 1`
  sql += ` ORDER BY name`
  return db.prepare(sql).all(stationId) as Record<string, unknown>[]
}

export function upsertMeter(db: Database, stationId: string, body: Record<string, unknown>) {
  const id = String(body.id ?? '').trim() || `meter-${randomUUID()}`
  const ts = nowIso()
  const exists = db.prepare(`SELECT id FROM station_meters WHERE id = ?`).get(id)
  if (!exists) {
    db.prepare(
      `INSERT INTO station_meters (id, station_id, name, category, unit, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      stationId,
      String(body.name ?? '').trim() || 'Zähler',
      body.category != null ? String(body.category) : null,
      String(body.unit ?? ''),
      ts,
      ts,
    )
  } else {
    db.prepare(
      `UPDATE station_meters SET name = COALESCE(?, name), category = COALESCE(?, category), unit = COALESCE(?, unit),
        active = COALESCE(?, active), updated_at = ? WHERE id = ? AND station_id = ?`,
    ).run(
      body.name != null ? String(body.name) : null,
      body.category !== undefined ? (body.category == null ? null : String(body.category)) : null,
      body.unit != null ? String(body.unit) : null,
      body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
      ts,
      id,
      stationId,
    )
  }
  return db.prepare(`SELECT * FROM station_meters WHERE id = ?`).get(id)
}

export function listMeterReadings(db: Database, stationId: string, meterId: string) {
  return db
    .prepare(`SELECT * FROM station_meter_readings WHERE station_id = ? AND meter_id = ? ORDER BY date DESC, time DESC`)
    .all(stationId, meterId) as Record<string, unknown>[]
}

export function addMeterReading(db: Database, stationId: string, meterId: string, body: Record<string, unknown>, uid?: string | null) {
  const id = `mr-${randomUUID()}`
  const ts = nowIso()
  const v = Number(body.value)
  if (!Number.isFinite(v)) throw new Error('value erforderlich')
  db.prepare(
    `INSERT INTO station_meter_readings (id, station_id, meter_id, date, time, value, note, photo_path, captured_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    stationId,
    meterId,
    String(body.date ?? '').slice(0, 10),
    body.time != null ? String(body.time) : null,
    v,
    body.note != null ? String(body.note) : null,
    body.photoPath != null ? String(body.photoPath) : null,
    uid ?? null,
    ts,
  )
  return db.prepare(`SELECT * FROM station_meter_readings WHERE id = ?`).get(id)
}

/* ——— Billing ——— */
export function listInvoices(db: Database, stationId: string) {
  return db
    .prepare(`SELECT * FROM account_invoices WHERE station_id = ? AND active = 1 ORDER BY invoice_date DESC`)
    .all(stationId) as Record<string, unknown>[]
}

export function upsertInvoice(db: Database, stationId: string, body: Record<string, unknown>) {
  const id = String(body.id ?? '').trim() || `inv-${randomUUID()}`
  const ts = nowIso()
  const exists = db.prepare(`SELECT id FROM account_invoices WHERE id = ?`).get(id)
  if (!exists) {
    db.prepare(
      `INSERT INTO account_invoices (id, station_id, invoice_number, invoice_date, period_from, period_to, amount_cents, status, pdf_path, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      stationId,
      String(body.invoiceNumber ?? '').trim() || id,
      String(body.invoiceDate ?? ts.slice(0, 10)),
      body.periodFrom != null ? String(body.periodFrom) : null,
      body.periodTo != null ? String(body.periodTo) : null,
      Math.round(Number(body.amountCents ?? 0)),
      String(body.status ?? 'open'),
      body.pdfPath != null ? String(body.pdfPath) : null,
      ts,
      ts,
    )
  } else {
    db.prepare(
      `UPDATE account_invoices SET invoice_number = COALESCE(?, invoice_number), invoice_date = COALESCE(?, invoice_date),
        period_from = COALESCE(?, period_from), period_to = COALESCE(?, period_to), amount_cents = COALESCE(?, amount_cents),
        status = COALESCE(?, status), pdf_path = COALESCE(?, pdf_path), active = COALESCE(?, active), updated_at = ?
      WHERE id = ? AND station_id = ?`,
    ).run(
      body.invoiceNumber != null ? String(body.invoiceNumber) : null,
      body.invoiceDate != null ? String(body.invoiceDate) : null,
      body.periodFrom !== undefined ? (body.periodFrom == null ? null : String(body.periodFrom)) : null,
      body.periodTo !== undefined ? (body.periodTo == null ? null : String(body.periodTo)) : null,
      body.amountCents != null ? Math.round(Number(body.amountCents)) : null,
      body.status != null ? String(body.status) : null,
      body.pdfPath !== undefined ? (body.pdfPath == null ? null : String(body.pdfPath)) : null,
      body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
      ts,
      id,
      stationId,
    )
  }
  return db.prepare(`SELECT * FROM account_invoices WHERE id = ?`).get(id)
}

export function billingRootDir(): string {
  const fromEnv = process.env.STATION_BILLING_DIR?.trim()
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv)
  return getBillingDocumentsDir()
}

export function listBillingDocuments(db: Database, stationId: string) {
  return db
    .prepare(
      `SELECT * FROM account_billing_documents WHERE station_id = ? AND (archived_at IS NULL OR trim(archived_at) = '') AND active = 1 ORDER BY created_at DESC`,
    )
    .all(stationId) as Record<string, unknown>[]
}

export function insertBillingDocument(
  db: Database,
  stationId: string,
  meta: { title: string; category?: string; fileName: string; relPath: string; mime: string; size: number; uid?: string | null },
) {
  const id = `bd-${randomUUID()}`
  const ts = nowIso()
  db.prepare(
    `INSERT INTO account_billing_documents (id, station_id, title, category, file_name, file_path, mime_type, file_size, active, uploaded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(
    id,
    stationId,
    meta.title,
    meta.category ?? null,
    meta.fileName,
    meta.relPath,
    meta.mime,
    meta.size,
    meta.uid ?? null,
    ts,
    ts,
  )
  return db.prepare(`SELECT * FROM account_billing_documents WHERE id = ?`).get(id)
}

export function archiveBillingDocument(db: Database, stationId: string, id: string) {
  const ts = nowIso()
  db.prepare(`UPDATE account_billing_documents SET active = 0, archived_at = ?, updated_at = ? WHERE id = ? AND station_id = ?`).run(
    ts,
    ts,
    id,
    stationId,
  )
}

export function ensureBillingDir(stationId: string, docId: string) {
  const dir = path.join(billingRootDir(), stationId, docId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function resolveBillingAbs(rel: string): string {
  const r = String(rel ?? '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!r || r.includes('..')) throw new Error('Ungültiger Dateipfad')
  const abs = path.resolve(process.cwd(), r)
  const root = path.resolve(billingRootDir())
  if (!abs.startsWith(root)) throw new Error('Pfad außerhalb des Abrechnungsordners')
  return abs
}
