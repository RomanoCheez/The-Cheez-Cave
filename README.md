# The Cheez Cave 🧀

A small full-stack web app for cataloguing the cheeses aging in your cave. It
serves a polished single-page frontend and a REST API backed by a JSON file, so
it runs with zero external services.

## Stack

- **Runtime:** Node.js 20+ (developed on Node 22)
- **Server / API:** Express (ES modules)
- **Frontend:** static HTML/CSS/vanilla JS (served by Express)
- **Persistence:** JSON file (`data/cheeses.json`, auto-seeded on first run)
- **Tests:** built-in `node --test` runner + `supertest`
- **Lint:** ESLint (flat config)

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the server with file watching on http://localhost:3000
```

Then open http://localhost:3000 and add a cheese to the cave.

## Scripts

| Command         | Description                                        |
| --------------- | -------------------------------------------------- |
| `npm start`     | Start the server (`src/server.js`).                |
| `npm run dev`   | Start the server with `--watch` auto-reload.       |
| `npm test`      | Run the API test suite.                            |
| `npm run lint`  | Lint the source with ESLint.                       |

## Configuration

| Variable           | Default                | Purpose                          |
| ------------------ | ---------------------- | -------------------------------- |
| `PORT`             | `3000`                 | Port the server listens on.      |
| `HOST`             | `0.0.0.0`              | Interface the server binds to.   |
| `CHEESE_DATA_FILE` | `data/cheeses.json`    | Path to the JSON data store.     |

## API

| Method   | Path                | Description                    |
| -------- | ------------------- | ------------------------------ |
| `GET`    | `/api/health`       | Health check.                  |
| `GET`    | `/api/cheeses`      | List all cheeses.              |
| `GET`    | `/api/cheeses/:id`  | Fetch a single cheese.         |
| `POST`   | `/api/cheeses`      | Add a cheese (`name` required).|
| `DELETE` | `/api/cheeses/:id`  | Remove a cheese.               |
