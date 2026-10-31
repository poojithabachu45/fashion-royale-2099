import { createGameServer, type Store } from "./app.ts";
import { createClient } from "redis";
import { Engine, DURATIONS } from "./engine.ts";
import { resolve } from "node:path";
const production = process.env.NODE_ENV === "production";
if (
  production &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
)
  throw new Error(
    "Set SESSION_SECRET to a random secret of at least 32 characters.",
  );
if (
  production &&
  (!process.env.PUBLIC_ORIGIN ||
    !/^https:\/\/[^/]+$/.test(process.env.PUBLIC_ORIGIN))
)
  throw new Error(
    "Set PUBLIC_ORIGIN to your exact HTTPS origin without a trailing slash.",
  );
if (production && !process.env.REDIS_URL)
  throw new Error("REDIS_URL is required in production to preserve matches.");
let store: Store | undefined;
let redis: ReturnType<typeof createClient> | undefined;
if (process.env.REDIS_URL) {
  redis = createClient({ url: process.env.REDIS_URL });
  redis.on("error", (e) => console.error("Datastore error:", e.message));
  await redis.connect();
  const client = redis;
  store = {
    async load() {
      const rooms = [];
      for await (const keys of client.scanIterator({
        MATCH: "fr2099:room:*",
        COUNT: 100,
      })) {
        for (const key of keys) {
          const v = await client.get(key);
          if (v) rooms.push(JSON.parse(v));
        }
      }
      return rooms;
    },
    async save(room) {
      await client.set("fr2099:room:" + room.code, JSON.stringify(room), {
        EX: 21600,
      });
    },
    async remove(code) {
      await client.del("fr2099:room:" + code);
    },
  };
}
// Fast timings are available only for local QA; production always uses real timings.
const fast = !production && process.env.QA_FAST === "1";
const game = createGameServer({
  production,
  secret: process.env.SESSION_SECRET,
  origin: process.env.PUBLIC_ORIGIN,
  store,
  engine: new Engine(
    undefined,
    fast
      ? {
          styling: 6000,
          runway: 1500,
          voting: 15000,
          results: 3000,
          hostGrace: 1500,
        }
      : DURATIONS,
  ),
});
if (production) {
  const express = (await import("express")).default;
  game.app.use(express.static(resolve("dist")));
  game.app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  game.app.use(vite.middlewares);
}
await game.initialize();
game.server.listen(
  Number(
    process.env.PORT ??
      (process.argv.includes("--port")
        ? process.argv[process.argv.indexOf("--port") + 1]
        : 3000),
  ),
  "0.0.0.0",
  () => console.log("Fashion Royale ready"),
);
async function shutdown() {
  await game.close();
  await redis?.quit();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
