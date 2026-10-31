import { randomInt, randomUUID } from "node:crypto";
import {
  DEFAULT_OUTFIT,
  THEMES,
  themeBonus,
  outfitSchema,
  configSchema,
  type Outfit,
  type Phase,
  type GameView,
} from "../shared/catalog.ts";
export class GameError extends Error {}
function ensure(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new GameError(msg);
}
export interface Player {
  id: string;
  session: string;
  name: string;
  team: number;
  connected: boolean;
  disconnectedAt: number | null;
  outfit: Outfit;
  submitted: boolean;
  total: number;
  voteTotal: number;
  roundScore: number;
  average: number;
  bonus: number;
}
export interface Room {
  code: string;
  phase: Phase;
  revision: number;
  createdAt: number;
  updatedAt: number;
  hostId: string;
  config: GameView["config"];
  players: Player[];
  participants: string[];
  electorate: string[];
  votes: Record<string, Record<string, number>>;
  round: number;
  theme: number;
  phaseStart: number;
  deadline: number | null;
  runwayOrder: string[];
}
export interface Durations {
  styling?: number;
  runway: number;
  voting: number;
  results: number;
  hostGrace: number;
}
export const DURATIONS: Durations = {
  runway: 6000,
  voting: 45000,
  results: 12000,
  hostGrace: 20000,
};
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function nickname(value: unknown) {
  ensure(typeof value === "string", "Enter a nickname.");
  const n = value.trim().replace(/\s+/g, " ");
  ensure(
    /^[\p{L}\p{N} _.-]{2,20}$/u.test(n),
    "Use 2–20 letters, numbers, spaces, dots or hyphens.",
  );
  return n;
}
export class Engine {
  rooms = new Map<string, Room>();
  constructor(
    public now = () => Date.now(),
    public durations: Durations = DURATIONS,
  ) {}
  create(session: string, name: unknown) {
    ensure(this.rooms.size < 1000, "The server is full. Try again shortly.");
    const recent = [...this.rooms.values()].filter((r) =>
      r.players.some((p) => p.session === session),
    );
    ensure(recent.length < 8, "Too many rooms. Rejoin an existing room.");
    let code = "";
    do {
      code = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
    } while (this.rooms.has(code));
    const t = this.now();
    const r: Room = {
      code,
      phase: "LOBBY",
      revision: 0,
      createdAt: t,
      updatedAt: t,
      hostId: "",
      config: { minutes: 5, rounds: 3, mode: "solo" },
      players: [],
      participants: [],
      electorate: [],
      votes: {},
      round: 0,
      theme: 0,
      phaseStart: t,
      deadline: null,
      runwayOrder: [],
    };
    this.add(r, session, name);
    r.hostId = r.players[0].id;
    this.rooms.set(code, r);
    return r;
  }
  get(code: unknown) {
    ensure(
      typeof code === "string" && /^[A-Z2-9]{6}$/.test(code),
      "Enter a valid six-character room code.",
    );
    const r = this.rooms.get(code);
    ensure(r, "Room not found or expired.");
    return r;
  }
  self(r: Room, session: string) {
    const p = r.players.find((p) => p.session === session);
    ensure(p, "Join this room first.");
    return p;
  }
  add(r: Room, session: string, name: unknown) {
    let p = r.players.find((p) => p.session === session);
    if (p) {
      p.connected = true;
      p.disconnectedAt = null;
      this.touch(r);
      return p;
    }
    ensure(r.players.length < 10, "This room is full (10 players).");
    const n = nickname(name);
    ensure(
      !r.players.some((p) => p.name.toLowerCase() === n.toLowerCase()),
      "That nickname is taken in this room.",
    );
    p = {
      id: randomUUID(),
      session,
      name: n,
      team:
        r.players.filter((p) => p.team === 0).length <=
        r.players.filter((p) => p.team === 1).length
          ? 0
          : 1,
      connected: true,
      disconnectedAt: null,
      outfit: { ...DEFAULT_OUTFIT },
      submitted: false,
      total: 0,
      voteTotal: 0,
      roundScore: 0,
      average: 0,
      bonus: 0,
    };
    r.players.push(p);
    this.touch(r);
    return p;
  }
  touch(r: Room) {
    r.revision++;
    r.updatedAt = this.now();
  }
  action(r: Room, session: string, type: string, data: unknown) {
    this.advance(r);
    const p = this.self(r, session);
    const host = () => ensure(p.id === r.hostId, "Only the host can do that.");
    switch (type) {
      case "configure":
        host();
        ensure(r.phase === "LOBBY", "Settings are locked during a match.");
        {
          const c = configSchema.safeParse(data);
          ensure(c.success, "Invalid match settings.");
          r.config = c.data;
        }
        break;
      case "team":
        ensure(r.phase === "LOBBY", "Teams are locked during a match.");
        ensure(data === 0 || data === 1, "Choose a valid team.");
        p.team = data;
        break;
      case "start":
        host();
        ensure(r.phase === "LOBBY", "Match already started.");
        ensure(
          r.players.filter((x) => x.connected).length >= 2,
          "At least two connected players are required.",
        );
        if (r.config.mode === "team")
          ensure(
            [0, 1].every((t) =>
              r.players.some((x) => x.connected && x.team === t),
            ),
            "Both teams need a connected player.",
          );
        this.startRound(r);
        break;
      case "outfit":
        ensure(
          r.phase === "LOBBY" || r.phase === "STYLING",
          "The studio is closed.",
        );
        ensure(
          r.phase === "LOBBY" || r.participants.includes(p.id),
          "You join styling next round.",
        );
        ensure(!p.submitted, "Your look is locked.");
        {
          const o = outfitSchema.safeParse(data);
          ensure(o.success, "Invalid wardrobe selection.");
          p.outfit = o.data;
        }
        break;
      case "submit":
        ensure(
          r.phase === "STYLING" && r.participants.includes(p.id),
          "You are not styling this round.",
        );
        ensure(!p.submitted, "Your look is already locked.");
        p.submitted = true;
        if (
          r.participants.every(
            (id) => r.players.find((x) => x.id === id)!.submitted,
          )
        )
          this.runway(r);
        break;
      case "vote": {
        ensure(r.phase === "VOTING", "Voting is closed.");
        ensure(r.electorate.includes(p.id), "You are spectating this round.");
        const v = data as { target?: string; stars?: number };
        ensure(
          v &&
            typeof v.target === "string" &&
            r.participants.includes(v.target),
          "Invalid outfit.",
        );
        ensure(v.target !== p.id, "You cannot vote for yourself.");
        const target = r.players.find((x) => x.id === v.target)!;
        ensure(
          r.config.mode !== "team" || target.team !== p.team,
          "You cannot vote for your teammate.",
        );
        ensure(
          Number.isInteger(v.stars) && v.stars! >= 1 && v.stars! <= 5,
          "Choose 1–5 stars.",
        );
        ensure(
          r.votes[p.id]?.[v.target] === undefined,
          "You have already rated this look.",
        );
        (r.votes[p.id] ??= {})[v.target] = v.stars!;
        if (this.votesComplete(r)) this.results(r);
        break;
      }
      case "again":
        host();
        ensure(r.phase === "FINAL", "Finish this match first.");
        r.phase = "LOBBY";
        r.round = 0;
        r.deadline = null;
        r.participants = [];
        r.electorate = [];
        r.votes = {};
        for (const x of r.players) {
          x.total = 0;
          x.voteTotal = 0;
          x.submitted = false;
          x.roundScore = 0;
          x.average = 0;
          x.bonus = 0;
        }
        break;
      default:
        throw new GameError("Unknown action.");
    }
    this.touch(r);
  }
  eligible(r: Room, voter: Player, target: Player) {
    return (
      voter.id !== target.id &&
      (r.config.mode !== "team" || voter.team !== target.team)
    );
  }
  votesComplete(r: Room) {
    return r.electorate.every((id) => {
      const p = r.players.find((x) => x.id === id)!;
      return r.participants.every(
        (t) =>
          !this.eligible(
            r,
            p,
            r.players.find((x) => x.id === t)!,
          ) || r.votes[id]?.[t] !== undefined,
      );
    });
  }
  startRound(r: Room, at = this.now()) {
    r.round++;
    r.theme = (r.round - 1) % THEMES.length;
    r.phase = "STYLING";
    r.phaseStart = at;
    r.deadline = at + (this.durations.styling ?? r.config.minutes * 60000);
    r.participants = r.players.filter((p) => p.connected).map((p) => p.id);
    r.electorate = [];
    r.votes = {};
    r.runwayOrder = [];
    for (const p of r.players) {
      p.submitted = false;
      p.roundScore = 0;
      p.average = 0;
      p.bonus = 0;
    }
  }
  runway(r: Room, at = this.now()) {
    for (const id of r.participants) this.player(r, id).submitted = true;
    r.phase = "RUNWAY";
    r.phaseStart = at;
    r.runwayOrder = [...r.participants].sort();
    r.deadline = at + Math.max(1, r.runwayOrder.length) * this.durations.runway;
  }
  player(r: Room, id: string) {
    return r.players.find((p) => p.id === id)!;
  }
  voting(r: Room, at: number) {
    r.phase = "VOTING";
    r.phaseStart = at;
    r.deadline = at + this.durations.voting;
    r.electorate = r.participants.filter((id) => this.player(r, id).connected);
    if (this.votesComplete(r)) this.results(r, at);
  }
  results(r: Room, at = this.now()) {
    ensure(r.phase === "VOTING", "Invalid score transition.");
    for (const id of r.participants) {
      const p = this.player(r, id);
      const ratings = Object.values(r.votes).flatMap((v) =>
        v[id] === undefined ? [] : [v[id]],
      );
      p.average = ratings.length
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;
      p.bonus = themeBonus(p.outfit, r.theme);
      p.roundScore = p.average * 20 + p.bonus;
      p.total += p.roundScore;
      p.voteTotal += p.average;
    }
    r.phase = "RESULTS";
    r.phaseStart = at;
    r.deadline = at + this.durations.results;
  }
  advance(r: Room) {
    let changed = false;
    const t = this.now();
    const host = this.player(r, r.hostId);
    if (
      !host.connected &&
      host.disconnectedAt !== null &&
      t - host.disconnectedAt >= this.durations.hostGrace
    ) {
      const next = r.players.find((p) => p.connected);
      if (next) {
        r.hostId = next.id;
        changed = true;
      }
    }
    for (let i = 0; i < 30 && r.deadline !== null && t >= r.deadline; i++) {
      const at = r.deadline;
      switch (r.phase) {
        case "STYLING":
          this.runway(r, at);
          break;
        case "RUNWAY":
          this.voting(r, at);
          break;
        case "VOTING":
          this.results(r, at);
          break;
        case "RESULTS":
          if (
            r.round >= r.config.rounds ||
            r.players.filter((p) => p.connected).length < 2
          ) {
            r.phase = "FINAL";
            r.deadline = null;
            r.phaseStart = at;
          } else this.startRound(r, at);
          break;
        default:
          r.deadline = null;
      }
      changed = true;
    }
    if (changed) this.touch(r);
    return changed;
  }
  disconnect(session: string) {
    const changed: Room[] = [];
    for (const r of this.rooms.values()) {
      const p = r.players.find((p) => p.session === session);
      if (p && p.connected) {
        p.connected = false;
        p.disconnectedAt = this.now();
        this.touch(r);
        changed.push(r);
      }
    }
    return changed;
  }
  view(r: Room, session: string): GameView {
    const me = this.self(r, session);
    const sorted = [...r.players].sort(
      (a, b) => b.total - a.total || b.voteTotal - a.voteTotal,
    );
    const publicPlayers = sorted.map((p, i) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      connected: p.connected,
      submitted: p.submitted,
      total: p.total,
      voteTotal: p.voteTotal,
      roundScore: p.roundScore,
      average: p.average,
      bonus: p.bonus,
      place:
        sorted.findIndex(
          (x) => x.total === p.total && x.voteTotal === p.voteTotal,
        ) + 1,
      ...(["RUNWAY", "VOTING", "RESULTS", "FINAL"].includes(r.phase) &&
      r.participants.includes(p.id)
        ? { outfit: p.outfit }
        : {}),
    }));
    const teamScores = [0, 1]
      .map((team) => {
        const members = r.players.filter((p) => p.team === team);
        return {
          team,
          score: members.length
            ? members.reduce((s, p) => s + p.total, 0) / members.length
            : 0,
          place: 1,
        };
      })
      .sort((a, b) => b.score - a.score);
    teamScores.forEach(
      (x, i) => (x.place = i && x.score === teamScores[0].score ? 1 : i + 1),
    );
    return {
      code: r.code,
      phase: r.phase,
      revision: r.revision,
      serverNow: this.now(),
      phaseStart: r.phaseStart,
      deadline: r.deadline,
      round: r.round,
      theme: r.theme,
      hostId: r.hostId,
      selfId: me.id,
      config: r.config,
      players: publicPlayers,
      participants: r.participants,
      electorate: r.electorate,
      votes: r.votes[me.id] ?? {},
      ownOutfit: me.outfit,
      locked: me.submitted,
      runwayOrder: r.runwayOrder,
      teamScores,
    };
  }
}
