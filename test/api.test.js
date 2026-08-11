import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { CheeseStore } from "../src/store.js";

describe("Cheez Cave API", () => {
  let app;
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "cheez-cave-"));
    const store = new CheeseStore(join(dir, "cheeses.json"), { seed: false });
    app = createApp(store);
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports health", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok" });
  });

  it("starts with an empty cave", async () => {
    const res = await request(app).get("/api/cheeses");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it("creates a cheese and returns it with an id", async () => {
    const res = await request(app)
      .post("/api/cheeses")
      .send({ name: "Comté", origin: "France", type: "hard", notes: "Brothy and nutty." });
    assert.equal(res.status, 201);
    assert.ok(res.body.id, "expected a generated id");
    assert.equal(res.body.name, "Comté");
    assert.equal(res.body.type, "hard");

    const list = await request(app).get("/api/cheeses");
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].name, "Comté");
  });

  it("rejects a cheese without a name", async () => {
    const res = await request(app).post("/api/cheeses").send({ origin: "Nowhere" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /name/i);
  });

  it("rejects an unknown type", async () => {
    const res = await request(app).post("/api/cheeses").send({ name: "Mystery", type: "gas" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /type/i);
  });

  it("deletes a cheese", async () => {
    const created = await request(app).post("/api/cheeses").send({ name: "Ephemeral" });
    const del = await request(app).delete(`/api/cheeses/${created.body.id}`);
    assert.equal(del.status, 204);

    const missing = await request(app).get(`/api/cheeses/${created.body.id}`);
    assert.equal(missing.status, 404);
  });

  it("returns 404 when deleting an unknown cheese", async () => {
    const res = await request(app).delete("/api/cheeses/does-not-exist");
    assert.equal(res.status, 404);
  });
});
