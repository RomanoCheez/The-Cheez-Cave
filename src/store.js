import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SEED_CHEESES = [
  {
    name: "Aged Gouda",
    origin: "Netherlands",
    type: "hard",
    notes: "Nutty and caramel-sweet with crunchy tyrosine crystals.",
  },
  {
    name: "Brie de Meaux",
    origin: "France",
    type: "soft",
    notes: "Bloomy rind, buttery and mushroomy at room temperature.",
  },
  {
    name: "Roquefort",
    origin: "France",
    type: "blue",
    notes: "Sharp, salty sheep's-milk blue aged in limestone caves.",
  },
];

/**
 * A tiny JSON-file backed store for cheeses.
 *
 * The data file path is configurable so tests can use an isolated temp file
 * (see the CHEESE_DATA_FILE environment variable in src/server.js).
 */
export class CheeseStore {
  constructor(dataFile, { seed = true } = {}) {
    this.dataFile = dataFile;
    if (!existsSync(this.dataFile)) {
      this.#writeAll(seed ? SEED_CHEESES.map(this.#withId) : []);
    }
  }

  #withId = (cheese) => ({ id: randomUUID(), createdAt: new Date().toISOString(), ...cheese });

  #readAll() {
    try {
      return JSON.parse(readFileSync(this.dataFile, "utf8"));
    } catch {
      return [];
    }
  }

  #writeAll(cheeses) {
    mkdirSync(dirname(this.dataFile), { recursive: true });
    const tmp = `${this.dataFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(cheeses, null, 2));
    renameSync(tmp, this.dataFile);
  }

  list() {
    return this.#readAll();
  }

  get(id) {
    return this.#readAll().find((cheese) => cheese.id === id) ?? null;
  }

  create({ name, origin, type, notes }) {
    const cheese = this.#withId({
      name: name.trim(),
      origin: (origin ?? "").trim(),
      type: (type ?? "other").trim(),
      notes: (notes ?? "").trim(),
    });
    const cheeses = this.#readAll();
    cheeses.push(cheese);
    this.#writeAll(cheeses);
    return cheese;
  }

  remove(id) {
    const cheeses = this.#readAll();
    const next = cheeses.filter((cheese) => cheese.id !== id);
    if (next.length === cheeses.length) return false;
    this.#writeAll(next);
    return true;
  }
}
