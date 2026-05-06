'use strict'

const path       = require('path')
const { existsSync } = require('fs')

const DEFAULT_MIGRATIONS_DIR = path.resolve(process.cwd(), 'db/migrations')

/**
 * Loads the ordered list of entities from manifest.js.
 *
 * The manifest controls execution order and documents dependencies.
 * Example manifest:
 *
 *   module.exports = [
 *     '_shared',   // shared functions & types — always first
 *     'user',
 *     'product',
 *     'order',     // depends on: user, product
 *   ]
 *
 * @param {Object} [options]
 * @param {string} [options.migrationsDir]  - override default db/migrations path
 * @returns {string[]}
 */
function loadManifest({ migrationsDir } = {}) {
  const dir          = migrationsDir || DEFAULT_MIGRATIONS_DIR
  const manifestPath = path.join(dir, 'manifest.js')

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Manifest not found at ${manifestPath}\n` +
      `Create db/migrations/manifest.js to define entity order.`
    )
  }

  // Delete from require cache so changes are picked up in long-lived processes
  delete require.cache[require.resolve(manifestPath)]
  const entities = require(manifestPath)

  if (!Array.isArray(entities) || entities.length === 0) {
    throw new Error('manifest.js must export a non-empty array of entity names.')
  }

  for (const entity of entities) {
    const entityDir = path.join(dir, entity)
    if (!existsSync(entityDir)) {
      throw new Error(
        `Entity "${entity}" listed in manifest but directory not found:\n  ${entityDir}`
      )
    }
  }

  return entities
}

module.exports = { loadManifest, MIGRATIONS_DIR: DEFAULT_MIGRATIONS_DIR }
