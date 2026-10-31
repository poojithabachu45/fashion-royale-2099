import express from "express";
import { createServer } from "node:http";
import {
  randomBytes,
  createHmac,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { parse, serialize } from "cookie";
import { Server } from "socket.io";
import { Engine, GameError, type Room } from "./engine.ts";
import type { Socket } from "socket.io";
export interface Store {
  load(): Promise<Room[]>;
  save(room: Room): Promise<void>;
  remove(code: string): Promise<void>;
}
export function createGameServer(
  options: {
    engine?: Engine;
    store?: Store;
    secret?: string;
    production?: boolean;
    origin?: string;
    frontend?: boolean;
  } = {},
) {
  const engine = options.engine ?? new Engine();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const server = createServer(app);
  const secret = options.secret ?? randomBytes(48).toString("hex");
  const production = options.production ?? false;
  const io = new Server(server, {
    maxHttpBufferSize: 16_384,
    pingInterval: 15000,
    pingTimeout: 20000,
    allowRequest: (req, cb) =>
      cb(
        null,
        allowed(
          req.headers.origin,
          req.headers.host,
          req.headers["x-forwarded-host"],
        ),
      ),
    cors: { origin: options.origin ?? false, credentials: true },
  });
  function allowed(
    origin: string | undefined,
    host: string | undefined,
    forwarded: unknown,
  ) {
    if (!origin) return true;
    try {
      return (
        origin ===
        (options.origin ??
          `${production ? "https" : "http"}://${typeof forwarded === "string" ? forwarded : host}`)
      );
    } catch {
      return false;
    }
  }
  const sign = (s: string) =>
    createHmac("sha256", secret).update(s).digest("hex");
  function session(token: string | undefined) {
    if (!token) return null;
    const [id, stamp, sig] = token.split(".");
    if (
      !id ||
      !stamp ||
      !sig ||
      !/^[a-f0-9]{64}$/.test(id) ||
      !/^[a-f0-9]{64}$/.test(sig)
    )
      return null;
    const raw = id + "." + stamp;
    const age = Date.now() - Number(stamp);
    if (!Number.isFinite(age) || age < 0 || age > 7 * 86400000) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(sign(raw)))) return null;
    return createHash("sha256").update(token).digest("hex");
  }
  const limits = new Map<string, { time: number; count: number }>();
  function limit(key: string, max: number, period = 10000) {
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || now - entry.time > period) {
      entry = { time: now, count: 0 };
      limits.set(key, entry);
    }
    if (++entry.count > max)
      throw new GameError("Too many requests. Please wait a moment.");
  }
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.get("/health", (_req, res) =>
    res.json({ ok: true, game: "Fashion Royale 2099" }),
  );
  app.post("/api/session", (req, res) => {
    if (
      !allowed(
        req.headers.origin,
        req.headers.host,
        req.headers["x-forwarded-host"],
      )
    ) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    try {
      limit("ip:" + req.ip, 30, 60000);
      let token = parse(req.headers.cookie ?? "").fr2099;
      if (!session(token)) {
        const raw = randomBytes(32).toString("hex") + "." + Date.now();
        token = raw + "." + sign(raw);
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Set-Cookie",
        serialize("fr2099", token!, {
          httpOnly: true,
          secure: production,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 86400,
        }),
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(429).json({ error: (e as Error).message });
    }
  });
  io.use((socket, next) => {
    const id = session(parse(socket.request.headers.cookie ?? "").fr2099);
    if (!id) return next(new Error("Session expired. Refresh to reconnect."));
    socket.data.session = id;
    next();
  });
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = queue.then(fn);
    queue = p.catch(() => {});
    return p;
  }
  function broadcast(r: Room) {
    for (const socket of io.sockets.sockets.values())
      if (socket.data.code === r.code) {
        try {
          socket.emit("state", engine.view(r, socket.data.session));
        } catch {}
      }
  }
  async function save(r: Room) {
    await options.store?.save(r);
  }
  const requests = new Map<string, { result: unknown; time: number }>();
  io.on("connection", (socket: Socket) => {
    socket.on("clock", (ack: unknown) => {
      if (typeof ack === "function") ack({ serverNow: Date.now() });
    });
    socket.on("command", (payload: unknown, ack: unknown) => {
      if (typeof ack !== "function") return;
      void serial(async () => {
        const sid = socket.data.session as string;
        let rollback: Room | undefined;
        let room: Room | undefined;
        let created = false;
        try {
          limit(sid, 80);
          if (!payload || typeof payload !== "object")
            throw new GameError("Invalid request.");
          const p = payload as {
            id: string;
            type: string;
            code?: string;
            data?: unknown;
          };
          if (
            typeof p.id !== "string" ||
            !/^[-\w]{8,80}$/.test(p.id) ||
            typeof p.type !== "string"
          )
            throw new GameError("Invalid request.");
          const key = sid + ":" + p.id;
          const cached = requests.get(key);
          if (cached) {
            ack(cached.result);
            return;
          }
          if (p.type === "create") {
            limit("create:" + sid, 5, 60000);
            room = engine.create(sid, (p.data as { name?: unknown })?.name);
            created = true;
            socket.data.code = room.code;
          } else if (p.type === "join") {
            limit("join:" + sid, 20, 60000);
            room = engine.get(p.code);
            rollback = structuredClone(room);
            engine.advance(room);
            engine.add(room, sid, (p.data as { name?: unknown })?.name);
            socket.data.code = room.code;
          } else if (p.type === "resume") {
            room = engine.get(p.code);
            rollback = structuredClone(room);
            engine.self(room, sid);
            engine.advance(room);
            engine.add(room, sid, "");
            socket.data.code = room.code;
          } else {
            room = engine.get(p.code);
            rollback = structuredClone(room);
            engine.action(room, sid, p.type, p.data);
          }
          await save(room);
          const result = { ok: true, code: room.code };
          requests.set(key, { result, time: Date.now() });
          broadcast(room);
          ack(result);
        } catch (e) {
          if (rollback) engine.rooms.set(rollback.code, rollback);
          else if (created && room) engine.rooms.delete(room.code);
          ack({
            ok: false,
            error:
              e instanceof GameError
                ? e.message
                : "Unable to save your action. Please retry.",
          });
          if (!(e instanceof GameError)) console.error("Command failed", e);
        }
      });
    });
    socket.on("disconnect", () => {
      void serial(async () => {
        if (
          [...io.sockets.sockets.values()].some(
            (s) => s.data.session === socket.data.session,
          )
        )
          return;
        for (const r of engine.disconnect(socket.data.session)) {
          try {
            await save(r);
            broadcast(r);
          } catch (e) {
            console.error("Disconnect save failed", e);
          }
        }
      });
    });
  });
  const tick = setInterval(() => {
    void serial(async () => {
      for (const r of engine.rooms.values()) {
        if (Date.now() - r.updatedAt > 6 * 3600000) {
          await options.store?.remove(r.code);
          engine.rooms.delete(r.code);
          continue;
        }
        const before = structuredClone(r);
        try {
          if (engine.advance(r)) {
            await save(r);
            broadcast(r);
          }
        } catch (e) {
          engine.rooms.set(before.code, before);
          console.error("Timer save failed", e);
        }
      }
      for (const [k, v] of requests)
        if (Date.now() - v.time > 600000) requests.delete(k);
      for (const [k, v] of limits)
        if (Date.now() - v.time > 600000) limits.delete(k);
    });
  }, 250);
  tick.unref();
  async function initialize() {
    const rooms = (await options.store?.load()) ?? [];
    for (const r of rooms) {
      for (const p of r.players) {
        p.connected = false;
        p.disconnectedAt = Date.now();
      }
      engine.rooms.set(r.code, r);
      engine.advance(r);
      await save(r);
    }
  }
  async function close() {
    clearInterval(tick);
    await queue;
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await queue;
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
  }
  return { app, server, io, engine, initialize, close };
}
