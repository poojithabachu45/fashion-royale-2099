import test from "node:test";
import assert from "node:assert/strict";
import { Engine, type Room } from "../server/engine.ts";
import { DEFAULT_OUTFIT, themeBonus } from "../shared/catalog.ts";
function setup() {
  let now = 1000;
  const e = new Engine(() => now, {
    styling: 5000,
    runway: 100,
    voting: 500,
    results: 100,
    hostGrace: 100,
  });
  const r = e.create("a", "Nova");
  e.add(r, "b", "Luna");
  return {
    e,
    r,
    advance: (ms: number) => {
      now += ms;
      e.advance(r);
    },
  };
}
test("random six-character room creation; validation and 10-player capacity", () => {
  const { e, r } = setup();
  assert.match(r.code, /^[A-Z2-9]{6}$/);
  assert.equal(e.get(r.code), r);
  assert.throws(() => e.get("ABC"));
  assert.throws(() => e.add(r, "c", "Nova"));
  assert.throws(() => e.add(r, "c", "<script>"));
  for (let i = 2; i < 10; i++) e.add(r, "p" + i, "Player " + i);
  assert.equal(r.players.length, 10);
  assert.throws(() => e.add(r, "overflow", "Overflow"));
  assert.equal(e.add(r, "a", "ignored").id, r.hostId);
});
test("host authorization; start and configuration validation", () => {
  const { e, r } = setup();
  assert.throws(() => e.action(r, "b", "start", null));
  assert.throws(() =>
    e.action(r, "a", "configure", { minutes: 1, rounds: 2, mode: "solo" }),
  );
  e.action(r, "a", "configure", { minutes: 2, rounds: 2, mode: "solo" });
  e.action(r, "a", "start", null);
  assert.equal(r.phase, "STYLING");
  assert.equal(r.deadline, 6000);
  assert.throws(() =>
    e.action(r, "a", "configure", { minutes: 5, rounds: 3, mode: "solo" }),
  );
});
test("outfit privacy, validated drafts and irrevocable submissions", () => {
  const { e, r } = setup();
  e.action(r, "a", "start", null);
  e.action(r, "a", "outfit", { ...DEFAULT_OUTFIT, accessory: "visor" });
  assert.equal(
    e.view(r, "b").players.find((p) => p.id === r.hostId)?.outfit,
    undefined,
  );
  assert.equal(e.view(r, "a").ownOutfit.accessory, "visor");
  assert.throws(() =>
    e.action(r, "a", "outfit", {
      ...DEFAULT_OUTFIT,
      primary: "javascript:bad",
    }),
  );
  e.action(r, "a", "submit", null);
  assert.throws(() => e.action(r, "a", "outfit", DEFAULT_OUTFIT));
  e.action(r, "b", "submit", null);
  assert.equal(r.phase, "RUNWAY");
  assert.equal(
    e.view(r, "b").players.find((p) => p.id === r.hostId)?.outfit?.accessory,
    "visor",
  );
});
test("server deadline freezes latest draft; all clients share deadline and runway order", () => {
  const { e, r, advance } = setup();
  e.action(r, "a", "start", null);
  e.action(r, "a", "outfit", { ...DEFAULT_OUTFIT, dress: "gown" });
  assert.equal(e.view(r, "a").deadline, e.view(r, "b").deadline);
  advance(5000);
  assert.equal(r.phase, "RUNWAY");
  assert.ok(r.players.every((p) => p.submitted));
  assert.deepEqual(e.view(r, "a").runwayOrder, e.view(r, "b").runwayOrder);
  assert.equal(r.players[0].outfit.dress, "gown");
  assert.throws(() => e.action(r, "a", "outfit", DEFAULT_OUTFIT));
  advance(200);
  assert.equal(r.phase, "VOTING");
});
test("voting restrictions, exactly-once scoring, average formula and full match", () => {
  const { e, r, advance } = setup();
  e.action(r, "a", "configure", { minutes: 5, rounds: 1, mode: "solo" });
  e.action(r, "a", "start", null);
  const [a, b] = r.players;
  assert.throws(() => e.action(r, "b", "vote", { target: a.id, stars: 5 }));
  advance(5200);
  assert.equal(r.phase, "VOTING");
  assert.throws(() => e.action(r, "a", "vote", { target: a.id, stars: 5 }));
  assert.throws(() => e.action(r, "a", "vote", { target: b.id, stars: 6 }));
  e.action(r, "a", "vote", { target: b.id, stars: 4 });
  assert.throws(() => e.action(r, "a", "vote", { target: b.id, stars: 1 }));
  assert.deepEqual(e.view(r, "b").votes, {});
  e.action(r, "b", "vote", { target: a.id, stars: 5 });
  assert.equal(r.phase, "RESULTS");
  assert.equal(a.total, 100 + themeBonus(a.outfit, 0));
  assert.equal(b.total, 80 + themeBonus(b.outfit, 0));
  const before = a.total;
  assert.throws(() => e.action(r, "b", "vote", { target: a.id, stars: 5 }));
  advance(100);
  assert.equal(r.phase, "FINAL");
  assert.equal(a.total, before);
  e.action(r, "a", "again", null);
  assert.equal(r.phase, "LOBBY");
  assert.equal(a.total, 0);
});
test("late joins spectate then participate next round", () => {
  const { e, r, advance } = setup();
  e.action(r, "a", "configure", { minutes: 5, rounds: 2, mode: "solo" });
  e.action(r, "a", "start", null);
  const c = e.add(r, "c", "Cyan");
  assert.ok(!r.participants.includes(c.id));
  assert.throws(() => e.action(r, "c", "outfit", DEFAULT_OUTFIT));
  advance(5200);
  assert.throws(() => e.action(r, "c", "vote", { target: r.hostId, stars: 5 }));
  advance(600);
  assert.equal(r.phase, "STYLING");
  assert.equal(r.round, 2);
  assert.ok(r.participants.includes(c.id));
});
test("disconnects, host transfer and identity-preserving reconnection", () => {
  const { e, r, advance } = setup();
  const id = r.hostId;
  e.action(r, "a", "start", null);
  e.action(r, "a", "outfit", { ...DEFAULT_OUTFIT, hair: "bob" });
  e.disconnect("a");
  advance(101);
  assert.equal(r.hostId, r.players[1].id);
  const reconnected = e.add(r, "a", "other");
  assert.equal(reconnected.id, id);
  assert.equal(reconnected.outfit.hair, "bob");
  assert.equal(reconnected.connected, true);
  assert.equal(r.players.length, 2);
});
test("team voting excludes teammates; team averaging and shared ties", () => {
  const { e, r, advance } = setup();
  e.add(r, "c", "Cyan");
  e.action(r, "a", "configure", { minutes: 5, rounds: 1, mode: "team" });
  e.action(r, "a", "start", null);
  advance(5300);
  const [a, b, c] = r.players;
  assert.equal(a.team, c.team);
  assert.throws(() => e.action(r, "a", "vote", { target: c.id, stars: 5 }));
  e.action(r, "a", "vote", { target: b.id, stars: 5 });
  e.action(r, "c", "vote", { target: b.id, stars: 3 });
  e.action(r, "b", "vote", { target: a.id, stars: 4 });
  e.action(r, "b", "vote", { target: c.id, stars: 4 });
  assert.equal(r.phase, "RESULTS");
  assert.equal(b.average, 4);
  assert.ok(e.view(r, "a").players.every((p) => p.place === 1));
  assert.equal(
    e.view(r, "a").teamScores[0].score,
    e.view(r, "a").teamScores[1].score,
  );
});
test("restart snapshot recovery advances overdue phases once; empty votes are explicit", () => {
  const { e, r } = setup();
  e.action(r, "a", "configure", { minutes: 5, rounds: 1, mode: "solo" });
  e.action(r, "a", "start", null);
  const restored = new Engine(() => 100000, e.durations);
  const snapshot = JSON.parse(JSON.stringify(r)) as Room;
  restored.rooms.set(r.code, snapshot);
  restored.advance(snapshot);
  assert.equal(snapshot.phase, "FINAL");
  assert.equal(snapshot.players[0].average, 0);
  const total = snapshot.players[0].total;
  restored.advance(snapshot);
  assert.equal(snapshot.players[0].total, total);
});
