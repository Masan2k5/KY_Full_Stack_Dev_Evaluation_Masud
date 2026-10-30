/* Added initial API server with a health check and a api/me endpoint that
looks up a user from the X-User-Id header */

import express from 'express'
import pg from 'pg'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://awards:awards_dev_only@localhost:5432/awards',
})

export const app = express()
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/me', async (request, response, next) => {
  const userId = Number(request.get('X-User-Id'))
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    response.status(401).json({ error: 'unauthorized' })
    return
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, organisation_id AS "organisationId"
       FROM users
       WHERE id = $1`,
      [userId],
    )
    if (rows.length === 0) {
      response.status(401).json({ error: 'unauthorized' })
      return
    }
    response.json(rows[0])
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  console.error('Request failed:', error)
  response.status(500).json({ error: 'internal_error' })
})

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(4000, () => {
    console.log('API listening on http://localhost:4000')
  })
}
