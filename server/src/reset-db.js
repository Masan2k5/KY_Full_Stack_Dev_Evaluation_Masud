/* Added a script to recreate the database tables 
and seed the extract users and organization assignments 
listed in the brief */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://awards:awards_dev_only@localhost:5432/awards',
})

const schemaPath = new URL('../db/schema.sql', import.meta.url)

async function resetDatabase() {
  const schema = await readFile(fileURLToPath(schemaPath), 'utf8')

  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
  await pool.query(schema)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      INSERT INTO organisations (id, name)
      SELECT id, 'Organisation ' || id
      FROM generate_series(1, 5) AS id
    `)

    const users = []
    for (let id = 1; id <= 3; id += 1) {
      users.push([id, `Organiser ${id}`, 'organiser', id])
    }
    for (let id = 101; id <= 112; id += 1) {
      users.push([
        id,
        `Judge ${id}`,
        'judge',
        ((id - 101) % 5) + 1,
      ])
    }
    for (let id = 201; id <= 260; id += 1) {
      users.push([
        id,
        `Applicant ${id}`,
        'applicant',
        ((id - 201) % 5) + 1,
      ])
    }

    for (const [id, name, role, organisationId] of users) {
      await client.query(
        `INSERT INTO users (id, name, role, organisation_id)
         VALUES ($1, $2, $3, $4)`,
        [id, name, role, organisationId],
      )
    }
    await client.query('COMMIT')
    console.log('Database reset and seeded with the required users.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

try {
  await resetDatabase()
} catch (error) {
  console.error('Database reset failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
