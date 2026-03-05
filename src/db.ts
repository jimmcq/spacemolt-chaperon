import { mkdir } from 'fs/promises'
import { join } from 'path'
import { Database } from 'bun:sqlite'
import { DecisionLogEntry, Memory } from './types'

let db: Database | null = null

export async function getDb(): Promise<Database> {
  if (db) return db

  const dataDir = join(process.cwd(), 'data')
  await mkdir(dataDir, { recursive: true })

  const dbPath = join(dataDir, 'chaperon.db')
  db = new Database(dbPath)

  // Enable WAL mode for concurrent access
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  await migrate(db)

  return db
}

async function migrate(database: Database) {
  // Create memories table if not exists
  database.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      importance INTEGER DEFAULT 0,
      last_updated TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)

  // Create decision log table if not exists
  database.exec(`
    CREATE TABLE IF NOT EXISTS decision_log (
      id TEXT PRIMARY KEY,
      cycle_number INTEGER NOT NULL,
      cycle_ts TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      world_snapshot TEXT NOT NULL,
      actions_taken TEXT NOT NULL,
      agents_observed TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_decision_log_cycle ON decision_log(cycle_number)
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_decision_log_ts ON decision_log(cycle_ts)
  `)

  console.log('[DB] Migrations completed')
}

export async function insertMemory(
  key: string,
  value: string,
  importance = 0,
): Promise<string> {
  const database = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  try {
    const stmt = database.prepare(
      `INSERT OR REPLACE INTO memories (id, key, value, importance, last_updated, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    stmt.run(id, key, value, importance, now, now)
    return id
  } catch (error) {
    console.error('Error inserting memory:', error)
    throw error
  }
}

export async function getMemory(key: string): Promise<Memory | null> {
  const database = await getDb()
  try {
    const stmt = database.prepare('SELECT * FROM memories WHERE key = ?')
    const result = stmt.get(key) as Memory | undefined
    return result || null
  } catch (error) {
    console.error('Error getting memory:', error)
    return null
  }
}

export async function getAllMemories(): Promise<Memory[]> {
  const database = await getDb()
  try {
    const stmt = database.prepare('SELECT * FROM memories ORDER BY importance DESC')
    const results = stmt.all() as Memory[]
    return results || []
  } catch (error) {
    console.error('Error getting all memories:', error)
    return []
  }
}

export async function deleteMemory(key: string): Promise<void> {
  const database = await getDb()
  try {
    const stmt = database.prepare('DELETE FROM memories WHERE key = ?')
    stmt.run(key)
  } catch (error) {
    console.error('Error deleting memory:', error)
    throw error
  }
}

export async function insertDecisionLog(entry: DecisionLogEntry): Promise<void> {
  const database = await getDb()
  try {
    const stmt = database.prepare(`
      INSERT INTO decision_log (
        id, cycle_number, cycle_ts, reasoning, world_snapshot,
        actions_taken, agents_observed, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      entry.id,
      entry.cycle_number,
      entry.cycle_ts,
      entry.reasoning,
      entry.world_snapshot,
      JSON.stringify(entry.actions_taken),
      JSON.stringify(entry.agents_observed),
      entry.created_at,
    )
  } catch (error) {
    console.error('Error inserting decision log:', error)
    throw error
  }
}

export async function getDecisionLog(limit = 50): Promise<DecisionLogEntry[]> {
  const database = await getDb()
  try {
    const stmt = database.prepare(`
      SELECT * FROM decision_log ORDER BY cycle_ts DESC LIMIT ?
    `)
    const rows = (stmt.all(limit) as any[]) || []
    return rows.map((row) => ({
      ...row,
      actions_taken: JSON.parse(row.actions_taken),
      agents_observed: JSON.parse(row.agents_observed),
    }))
  } catch (error) {
    console.error('Error getting decision log:', error)
    return []
  }
}

export async function getLastCycleNumber(): Promise<number> {
  const database = await getDb()
  try {
    const stmt = database.prepare('SELECT MAX(cycle_number) as max_cycle FROM decision_log')
    const result = stmt.get() as any
    return result?.max_cycle || 0
  } catch (error) {
    console.error('Error getting last cycle number:', error)
    return 0
  }
}
