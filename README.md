# Mini Awards

Full-stack awards application using React, Express, and PostgreSQL.

## Prerequisites

- Node.js 20+ and npm. Check the installed version with `node --version`.
- Docker with Docker Compose

## Setup

From the project root:

```sh
docker compose up -d
npm install
npm run db:reset
npm run dev
npm test
```

`npm run db:reset` drops and recreates the PostgreSQL `public` schema, then seeds the development users. Do not run it against a database containing data you need to keep.

`npm run dev` keeps running in the foreground. Start it, then run `npm test` from a second terminal at the project root.

## Application URLs

- Web app: <http://localhost:5173>
- API: <http://localhost:4000>
- Judge screen example: <http://localhost:5173/judge?as=101>

The judge URL uses the development `X-User-Id` login stub; it is not production authentication.

## Tests and build

Run the API test suite:

```sh
npm test
```

Build the client:

```sh
npm run build --workspace client
```

Stop the PostgreSQL container when finished:

```sh
docker compose down
```
