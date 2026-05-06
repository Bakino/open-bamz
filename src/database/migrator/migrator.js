'use strict'

const { EventEmitter }          = require('events')
const { collectFiles }          = require('./collector')
const path = require('path')

/**
 * @typedef {Object} MigrationResult
 * @property {'applied'|'replayed'} action
 * @property {string} id         - "entity/filename.sql"
 * @property {string} entity
 * @property {'versioned'|'idempotent'} type
 */

/**
 * @typedef {Object} MigrationReport
 * @property {MigrationResult[]} results
 * @property {ChecksumWarning[]} warnings
 * @property {boolean}           dryRun
 * @property {number}            appliedCount
 * @property {number}            replayedCount
 */

/**
 * @typedef {Object} ChecksumWarning
 * @property {string} id
 * @property {string} expected   - checksum recorded in schema_migrations
 * @property {string} actual     - checksum of current file on disk
 */

/**
 * @typedef {Object} StatusReport
 * @property {StatusEntry[]} versioned
 * @property {StatusEntry[]} idempotent
 * @property {number}        pendingCount
 */

/**
 * @typedef {Object} StatusEntry
 * @property {string}            id
 * @property {string}            entity
 * @property {string}            file
 * @property {'applied'|'pending'|'modified'} status
 * @property {Date|null}         appliedAt
 * @property {boolean}           checksumMismatch
 */

/**
 * Migrator — programmatic API for running database migrations.
 *
 * Events emitted during migrate():
 *   'start'    ({ total: number, dryRun: boolean })
 *   'applying' ({ id, entity, type: 'versioned' })
 *   'replaying'({ id, entity, type: 'idempotent' })
 *   'applied'  ({ id, entity, type: 'versioned' })
 *   'replayed' ({ id, entity, type: 'idempotent' })
 *   'warning'  (ChecksumWarning)
 *   'done'     (MigrationReport)
 *
 * Usage:
 *
 *   const { Migrator }    = require('./src/migrator')
 *   const { createPool }  = require('./src/db')
 *
 *   const pool     = createPool()
 *   const migrator = new Migrator({ pool })
 *
 *   migrator.migrate().then(function(report) {
 *     console.log('applied:', report.appliedCount)
 *   })
 *
 *   // Always end the pool when done
 *   pool.end()
 */
class Migrator extends EventEmitter {
  /**
   * @param {Object} options
   * @param {import('pg').Pool} options.pool  - pg connection pool (required)
   * @param {string} [options.migrationsDir]  - override default db/migrations path
   */
  constructor(options) {
    super()
    options = options || {}

    if (!options.pool) {
      throw new Error('Migrator requires a pg Pool instance ({ pool })')
    }

    this.pool          = options.pool
    this.migrationsDir = options.migrationsDir || null
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Run pending migrations.
   *
   * @param {Object}  [options]
   * @param {boolean} [options.dryRun=false]  - preview without executing
   * @param {string}  [options.entity]        - restrict to one entity
   * @returns {Promise<MigrationReport>}
   */
  async migrate(options) {
    options = options || {}
    const dryRun = options.dryRun || false
    const entity = options.entity || null

    const client = await this.pool.connect()
    try {
      await this._ensureMigrationsTable(client)
      const files = await this._resolveFiles(entity)
      return await this._run(client, files, { dryRun })
    } finally {
      client.release()
    }
  }

  /**
   * Return the current status of all migrations without executing anything.
   *
   * @param {Object} [options]
   * @param {string} [options.entity]  - restrict to one entity
   * @returns {Promise<StatusReport>}
   */
  async status(options) {
    options = options || {}
    const entity = options.entity || null

    const client = await this.pool.connect()
    try {
      await this._ensureMigrationsTable(client)
      const files   = await this._resolveFiles(entity)
      const applied = await this._getApplied(client)

      const versioned  = files.filter(function(f) { return f.type === 'versioned' })
      const idempotent = files.filter(function(f) { return f.type === 'idempotent' })

      const versionedEntries = versioned.map(function(f) {
        const rec = applied.get(f.id)
        if (!rec) {
          return { id: f.id, entity: f.entity, file: f.file,
                   status: 'pending', appliedAt: null, checksumMismatch: false }
        }
        const checksumMismatch = rec.checksum !== f.checksum
        return {
          id:              f.id,
          entity:          f.entity,
          file:            f.file,
          status:          checksumMismatch ? 'modified' : 'applied',
          appliedAt:       new Date(rec.applied_at),
          checksumMismatch: checksumMismatch,
        }
      })

      const idempotentEntries = idempotent.map(function(f) {
        return { id: f.id, entity: f.entity, file: f.file,
                 status: 'replayed', appliedAt: null, checksumMismatch: false }
      })

      return {
        versioned:    versionedEntries,
        idempotent:   idempotentEntries,
        pendingCount: versionedEntries.filter(function(e) { return e.status === 'pending' }).length,
      }
    } finally {
      client.release()
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  async _resolveFiles(entity) {
    const manifest = (await import(path.join(this.migrationsDir, "manifest.js"))).default ;
    
    let entities = manifest
    if (entity) {
      if (manifest.indexOf(entity) === -1) {
        throw new Error(
          'Entity "' + entity + '" not found in manifest. Available: ' + manifest.join(', ')
        )
      }
      entities = [entity]
    }

    return collectFiles(entities, { migrationsDir: this.migrationsDir })
  }

  async _run(client, files, { dryRun }) {
    const self     = this
    const applied  = await this._getApplied(client)
    const warnings = []

    // Detect checksum mismatches on already-applied versioned files
    files
      .filter(function(f) { return f.type === 'versioned' && applied.has(f.id) })
      .forEach(function(f) {
        const rec = applied.get(f.id)
        if (rec.checksum !== f.checksum) {
          const warning = { id: f.id, expected: rec.checksum, actual: f.checksum }
          warnings.push(warning)
          self.emit('warning', warning)
        }
      })

    const pending = files.filter(function(f) {
      return f.type === 'idempotent' || !applied.has(f.id)
    })

    const results = []

    this.emit('start', { total: pending.length, dryRun: dryRun })

    if (dryRun) {
      pending.forEach(function(f) {
        results.push({ action: f.type === 'versioned' ? 'applied' : 'replayed',
                       id: f.id, entity: f.entity, type: f.type })
      })
    } else {
      await client.query('BEGIN')
      let runningQuery = null;
      try {
        for (const f of pending) {
          if (f.type === 'versioned') {
            this.emit('applying', { id: f.id, entity: f.entity, type: f.type })
            runningQuery = f.content ;
            await client.query(f.content)
            await client.query(
              'INSERT INTO openbamz.schema_migrations (id, entity, checksum) VALUES ($1, $2, $3)',
              [f.id, f.entity, f.checksum]
            )
            this.emit('applied', { id: f.id, entity: f.entity, type: f.type })
            results.push({ action: 'applied', id: f.id, entity: f.entity, type: f.type })
          } else {
            this.emit('replaying', { id: f.id, entity: f.entity, type: f.type })
            await client.query(f.content)
            this.emit('replayed', { id: f.id, entity: f.entity, type: f.type })
            results.push({ action: 'replayed', id: f.id, entity: f.entity, type: f.type })
          }
        }
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error("Error occurred while migrating: " + runningQuery + " - " + err.message)
      }
    }

    const report = {
      results:       results,
      warnings:      warnings,
      dryRun:        dryRun,
      appliedCount:  results.filter(function(r) { return r.action === 'applied' }).length,
      replayedCount: results.filter(function(r) { return r.action === 'replayed' }).length,
    }

    this.emit('done', report)
    return report
  }

  async _ensureMigrationsTable(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS openbamz.schema_migrations (
        id          TEXT        PRIMARY KEY,
        entity      TEXT        NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        checksum    TEXT        NOT NULL
      )
    `)
  }

  async _getApplied(client) {
    const { rows } = await client.query(
      'SELECT id, checksum, applied_at FROM openbamz.schema_migrations ORDER BY applied_at'
    )
    const map = new Map()
    rows.forEach(function(r) { map.set(r.id, r) })
    return map
  }
}

module.exports = { Migrator }
