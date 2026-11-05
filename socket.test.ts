import test from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { createGameServer } from "../server/app.ts";
import { Engine } from "../server/engine.ts";
import {
  themeBonus,
  DEFAULT_OUTFIT,
  type GameView,
} from "../shared/catalog.ts";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("real HTTP anonymous sessions + 10 independent Socket.IO clients: sync, locks, votes, reconnect and idempotency", async () => {
  const server = createGameServer({
    engine: new Engine(undefined, {
      styling: 3000,
      runway: 50,
      voting: 2000,
      results: 1000,
      hostGrace: 100,
    }),
  });
  await new Promise<void>((r) => server.server.listen(0, "127.0.0.1", r));
  const addr = server.server.address() as { port: number };
  const url = "http://127.0.0.1:" + addr.port;
  const sockets: Socket[] = [];
  const cookies: string[] = [];
  const states: (GameView | undefined)[] = [];
  async function connect(i: number) {
    const s = io(url, {
      extraHeaders: { Cookie: cookies[i] },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    s.on("state", (v) => (states[i] = v));
    await new Promise<void>((resolve, reject) => {
      s.once("connect", () => resolve());
      s.once("connect_error", reject);
    });
    sockets[i] = s;
    return s;
  }
  async function cmd(
    i: number,
    type: string,
    data?: unknown,
    code?: string,
    id = crypto.randomUUID(),
  ) {
    return new Promise<any>((resolve) =>
      sockets[i].emit(
        "command",
        { id, type, data, code: code ?? states[i]?.code },
        resolve,
      ),
    );
  }
  try {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(url + "/api/session", { method: "POST" });
      assert.equal(res.status, 200);
      cookies[i] = res.headers.get("set-cookie")!.split(";")[0];
      await connect(i);
    }
    const made = await cmd(0, "create", { name: "Designer 0" });
    assert.equal(made.ok, true);
    for (let i = 1; i < 10; i++)
      assert.equal(
        (await cmd(i, "join", { name: "Designer " + i }, made.code)).ok,
        true,
      );
    await delay(100);
    assert.ok(states.every((v) => v?.players.length === 10));
    const id = crypto.randomUUID();
    const first = await cmd(
      0,
      "configure",
      { minutes: 2, rounds: 1, mode: "solo" },
      undefined,
      id,
    );
    assert.deepEqual(
      await cmd(
        0,
        "configure",
        { minutes: 5, rounds: 3, mode: "solo" },
        undefined,
        id,
      ),
      first,
    );
    assert.equal(states[0]!.config.minutes, 2);
    assert.equal((await cmd(1, "start")).ok, false);
    assert.equal((await cmd(0, "start")).ok, true);
    await delay(50);
    assert.ok(states.every((v) => v?.phase === "STYLING"));
    assert.ok(states.every((v) => v?.deadline === states[0]?.deadline));
    const playerId = states[1]!.selfId;
    sockets[1].disconnect();
    await delay(50);
    await connect(1);
    assert.equal((await cmd(1, "resume", undefined, made.code)).ok, true);
    assert.equal(states[1]?.selfId, playerId);
    assert.equal((await cmd(1, "submit")).ok, true);
    for (let i = 0; i < 10; i++)
      if (i !== 1) assert.equal((await cmd(i, "submit")).ok, true);
    await delay(800);
    assert.equal(states[0]?.phase, "VOTING");
    assert.equal(
      (await cmd(0, "vote", { target: states[0]!.selfId, stars: 5 })).ok,
      false,
    );
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 10; j++)
        if (i !== j)
          assert.equal(
            (await cmd(i, "vote", { target: states[j]!.selfId, stars: 4 })).ok,
            true,
          );
    await delay(50);
    assert.ok(states.every((v) => v?.phase === "RESULTS"));
    assert.ok(
      states[0]!.players.every(
        (p) =>
          p.average === 4 && p.total === 80 + themeBonus(DEFAULT_OUTFIT, 0),
      ),
    );
    assert.equal(
      (await cmd(0, "vote", { target: playerId, stars: 1 })).ok,
      false,
    );
    await delay(1200);
    assert.ok(states.every((v) => v?.phase === "FINAL"));
  } finally {
    for (const s of sockets) s?.disconnect();
    await server.close();
  }
});
test("unauthenticated sockets and cross-origin session requests are rejected", async () => {
  const game = createGameServer();
  await new Promise<void>((r) => game.server.listen(0, "127.0.0.1", r));
  const url =
    "http://127.0.0.1:" + (game.server.address() as { port: number }).port;
  try {
    assert.equal(
      (
        await fetch(url + "/api/session", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const s = io(url, { transports: ["websocket"], reconnection: false });
    await new Promise<void>((resolve, reject) => {
      s.on("connect_error", () => {
        s.close();
        resolve();
      });
      s.on("connect", () =>
        reject(new Error("Accepted unauthenticated client")),
      );
    });
  } finally {
    await game.close();
  }
});
test("persistence failure rolls back a command and never acknowledges an unsaved outfit", async () => {
  let fail = false;
  const snapshots = new Map<string, any>();
  const game = createGameServer({
    store: {
      async load() {
        return [];
      },
      async save(r) {
        if (fail) throw new Error("simulated store outage");
        snapshots.set(r.code, structuredClone(r));
      },
      async remove(c) {
        snapshots.delete(c);
      },
    },
  });
  await new Promise<void>((r) => game.server.listen(0, "127.0.0.1", r));
  const url =
    "http://127.0.0.1:" + (game.server.address() as { port: number }).port;
  const res = await fetch(url + "/api/session", { method: "POST" });
  const s = io(url, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { Cookie: res.headers.get("set-cookie")!.split(";")[0] },
  });
  try {
    await new Promise<void>((resolve) => s.on("connect", resolve));
    const send = (type: string, data: unknown, code?: string) =>
      new Promise<any>((resolve) =>
        s.emit(
          "command",
          { id: crypto.randomUUID(), type, data, code },
          resolve,
        ),
      );
    const made = await send("create", { name: "Nova" });
    assert.equal(made.ok, true);
    fail = true;
    assert.equal(
      (await send("outfit", { ...DEFAULT_OUTFIT, hair: "bob" }, made.code)).ok,
      false,
    );
    assert.equal(game.engine.get(made.code).players[0].outfit.hair, "long");
    assert.equal(snapshots.get(made.code).players[0].outfit.hair, "long");
  } finally {
    s.disconnect();
    await game.close();
  }
});
