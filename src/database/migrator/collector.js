'use strict'

const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const { MIGRATIONS_DIR } = require('./manifest')

/**
 * A MigrationFile describes one SQL file to be executed.
 *
 * @typedef {Object} MigrationFile
 * @property {string}  id        - Unique id: "entity/filename.sql"
 * @property {string}  entity    - Entity folder name
 * @property {string}  file      - Filename (e.g. "001_create_table.sql")
 * @property {string}  filepath  - Absolute path to the file
 * @property {'versioned'|'idempotent'} type
 *   versioned  — numbered (001_*.sql), run once, tracked in schema_migrations
 *   idempotent — unnumbered (triggers.sql, functions.sql), replayed every run
 * @property {string}  checksum  - MD5 of file contents
 * @property {string}  content   - Raw SQL content
 */

/**
 * Scans entity directories and returns an ordered list of MigrationFile objects.
 * Within each entity: versioned files come first (sorted by number), then
 * idempotent files (sorted alphabetically).
 *
 * @param {string[]} entities - Ordered entity names from manifest
 * @param {Object}  [options]
 * @param {string}  [options.migrationsDir] - override default db/migrations path
 * @returns {MigrationFile[]}
 */
function collectFiles(entities, { migrationsDir } = {}) {
  const baseDir = migrationsDir || MIGRATIONS_DIR
  const files   = []

  for (const entity of entities) {
    const dir     = path.join(baseDir, entity)
    const entries = fs.readdirSync(dir)
      .filter(function(f) { return f.endsWith('.sql') })
      .sort()

    const versioned  = entries.filter(function(f) { return /^\d+_/.test(f) })
    const idempotent = entries.filter(function(f) { return !/^\d+_/.test(f) })

    versioned.concat(idempotent).forEach(function(file) {
      const filepath = path.join(dir, file)
      const content  = fs.readFileSync(filepath, 'utf8')

      files.push({
        id:       entity + '/' + file,
        entity:   entity,
        file:     file,
        filepath: filepath,
        type:     /^\d+_/.test(file) ? 'versioned' : 'idempotent',
        checksum: md5(content),
        content:  content,
      })
    })
  }

  return files
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex')
}

module.exports = { collectFiles }
