import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { runSchema } from './schema.js'
import { ensureMinimumWageRatesSeeded } from './migrations.js'

describe('minimum wage seed', () => {
  let tmp = ''
  let db: Database.Database

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-minwage-'))
    const dbPath = path.join(tmp, 'test.db')
    db = new Database(dbPath)
    runSchema(db)
  })

  after(() => {
    db.close()
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('inserts DE defaults idempotently', () => {
    ensureMinimumWageRatesSeeded(db)
    const count1 = (db.prepare(`SELECT COUNT(*) as n FROM minimum_wage_rates`).get() as { n: number }).n
    assert.equal(count1, 3)

    ensureMinimumWageRatesSeeded(db)
    const count2 = (db.prepare(`SELECT COUNT(*) as n FROM minimum_wage_rates`).get() as { n: number }).n
    assert.equal(count2, 3)

    const r2026 = db
      .prepare(`SELECT hourly_rate FROM minimum_wage_rates WHERE valid_from = ?`)
      .get('2026-01-01') as { hourly_rate: number }
    assert.equal(r2026.hourly_rate, 13.9)
  })
})
