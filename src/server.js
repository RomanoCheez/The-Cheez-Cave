import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./app.js";
import { CheeseStore } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATA_FILE = process.env.CHEESE_DATA_FILE ?? join(__dirname, "..", "data", "cheeses.json");

const store = new CheeseStore(DATA_FILE);
const app = createApp(store);

app.listen(PORT, HOST, () => {
  console.log(`🧀 The Cheez Cave is open at http://${HOST}:${PORT}`);
  console.log(`   Data file: ${DATA_FILE}`);
});
