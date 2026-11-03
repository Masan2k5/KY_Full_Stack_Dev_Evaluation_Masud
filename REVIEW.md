# Code review: entry search and CSV export

1. **High — authorization / data exposure** (`routes/entries.js:1-40`). `requireLogin` checks only that a user exists; neither route verifies organiser role or programme ownership. Any signed-in user can enumerate/export any programme’s entries and applicant contact data. Require an organiser, scope both queries to the owner, and remove unnecessary email/phone.

   Corrected search query (also fixes the unsafe sort construction):

   ```js
   if (req.user.role !== 'organiser') return res.sendStatus(403);
   const columns = { created_at: 'e.created_at', title: 'e.title' };
   const sort = columns[req.query.sort] ?? columns.created_at;
   const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
   const { rows } = await db.query(
     `SELECT e.id, e.title, e.status, u.name AS applicant_name
        FROM entries e JOIN users u ON u.id = e.applicant_id
       WHERE e.programme_id = $1
         AND EXISTS (SELECT 1 FROM programmes p
                      WHERE p.id = e.programme_id AND p.organiser_id = $2)
         AND e.title ILIKE '%' || $3 || '%'
       ORDER BY ${sort} ${dir} LIMIT 100`,
     [req.params.programmeId, req.user.id, String(req.query.q ?? '')],
   );
   ```
   Test that a different organiser cannot retrieve another organiser’s entries or CSV.

2. **High — SQL injection** (`routes/entries.js:9`). Raw `sort`/`dir` interpolation permits SQL expression injection in `ORDER BY`; parameterized `q` does not help. Use strict allowlists as above.

3. **Medium — resource exhaustion** (`routes/entries.js:4-20, 23-40`). Both routes load every row; search also runs one score query per entry. Large programmes can exhaust memory and overload PostgreSQL. Batch results and aggregate scores once.

4. **Medium — unsafe CSV** (`routes/entries.js:34-38`). Other fields are unquoted, so commas/newlines corrupt rows; formula-leading values may execute in spreadsheets. Escape all fields and neutralize formulas.

No equivalent dynamic SQL was found in my Part A app; ordering is fixed. **Verdict: block** because any logged-in user can access other programmes’ data, attacker-controlled sorting can inject SQL, and exported values can trigger spreadsheet formulas. These are production security and data-exposure risks, not cosmetic issues.
