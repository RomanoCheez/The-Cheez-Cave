import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const VALID_TYPES = new Set(["hard", "soft", "blue", "fresh", "semi-soft", "other"]);

/**
 * Build the Express application around a given CheeseStore.
 * Kept free of any server/listen concerns so it can be exercised in tests.
 */
export function createApp(store) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/cheeses", (_req, res) => {
    res.json(store.list());
  });

  app.get("/api/cheeses/:id", (req, res) => {
    const cheese = store.get(req.params.id);
    if (!cheese) return res.status(404).json({ error: "Cheese not found" });
    res.json(cheese);
  });

  app.post("/api/cheeses", (req, res) => {
    const { name, origin, type, notes } = req.body ?? {};
    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "A cheese needs a name." });
    }
    if (type != null && !VALID_TYPES.has(String(type))) {
      return res.status(400).json({ error: `Unknown type. Use one of: ${[...VALID_TYPES].join(", ")}` });
    }
    const cheese = store.create({ name, origin, type, notes });
    res.status(201).json(cheese);
  });

  app.delete("/api/cheeses/:id", (req, res) => {
    const removed = store.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: "Cheese not found" });
    res.status(204).end();
  });

  app.use(express.static(PUBLIC_DIR));

  return app;
}
