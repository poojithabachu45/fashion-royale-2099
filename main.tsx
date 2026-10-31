import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import { Avatar } from "./Avatar";
import {
  COLORS,
  SKINS,
  HAIR_COLORS,
  DEFAULT_OUTFIT,
  PRESETS,
  THEMES,
  themeBonus,
  type Outfit,
  type GameView,
} from "../shared/catalog";
import "./style.css";
type Reply = { ok: boolean; error?: string; code?: string };
const actionId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
function App() {
  const [game, setGame] = useState<GameView | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(() => localStorage.getItem("fr:name") ?? ""),
    [code, setCode] = useState(
      () => new URLSearchParams(location.search).get("room") ?? "",
    ),
    [join, setJoin] = useState(() =>
      new URLSearchParams(location.search).has("room"),
    ),
    [help, setHelp] = useState(false),
    [time, setTime] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [tab, setTab] = useState("Outfits"),
    [draft, setDraft] = useState<Outfit>(DEFAULT_OUTFIT),
    [toast, setToast] = useState("");
  const socket = useRef<Socket | null>(null),
    gameRef = useRef<GameView | null>(null),
    draftRef = useRef<Outfit>(DEFAULT_OUTFIT),
    saveChain = useRef<Promise<unknown>>(Promise.resolve()),
    saved = useRef(JSON.stringify(DEFAULT_OUTFIT));
  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  }
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 100);
    let cancelled = false;
    let s: Socket;
    (async () => {
      try {
        const res = await fetch("/api/session", { method: "POST" });
        if (!res.ok)
          throw new Error("Unable to create your session. Please refresh.");
        if (cancelled) return;
        s = io({
          autoConnect: false,
          reconnection: true,
          reconnectionDelay: 500,
          reconnectionDelayMax: 5000,
        });
        socket.current = s;
        const syncClock = () => {
          const sent = Date.now();
          s.timeout(4000).emit(
            "clock",
            (e: unknown, v: { serverNow: number }) => {
              if (!e && v) setOffset(v.serverNow - (sent + Date.now()) / 2);
            },
          );
        };
        s.on("connect", () => {
          setConnected(true);
          setError("");
          syncClock();
          const room = localStorage.getItem("fr:room");
          if (room)
            s.timeout(5000).emit(
              "command",
              { id: actionId(), type: "resume", code: room },
              (e: unknown, r: Reply) => {
                if (e) setError("Reconnection timed out. Retrying…");
                else if (!r.ok) {
                  localStorage.removeItem("fr:room");
                  setError(r.error ?? "Unable to resume.");
                }
              },
            );
        });
        s.on("state", (v: GameView) => {
          const previous = gameRef.current;
          if (previous?.code === v.code && v.revision < previous.revision)
            return;
          gameRef.current = v;
          setGame(v);
          localStorage.setItem("fr:room", v.code);
          if (
            !previous ||
            previous.code !== v.code ||
            previous.phase !== v.phase ||
            previous.round !== v.round
          ) {
            setDraft(v.ownOutfit);
            draftRef.current = v.ownOutfit;
            saved.current = JSON.stringify(v.ownOutfit);
            setTab("Outfits");
          }
        });
        s.on("disconnect", () => setConnected(false));
        s.on("connect_error", (e: Error) => setError(e.message));
        s.connect();
        const clock = setInterval(syncClock, 15000);
        s.on("dispose", () => clearInterval(clock));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (s) {
        s.emit("dispose");
        s.disconnect();
      }
    };
  }, []);
  async function send(
    type: string,
    data?: unknown,
    room = gameRef.current?.code,
  ): Promise<Reply> {
    const s = socket.current;
    if (!s?.connected)
      throw new Error(
        "Connection lost. Your session will resume automatically.",
      );
    const payload = { id: actionId(), type, code: room, data };
    for (let i = 0; i < 2; i++) {
      try {
        return await new Promise<Reply>((resolve, reject) =>
          s
            .timeout(5000)
            .emit("command", payload, (err: unknown, r: Reply) =>
              err
                ? reject(new Error("Server did not acknowledge. Please retry."))
                : r.ok
                  ? resolve(r)
                  : reject(new Error(r.error)),
            ),
        );
      } catch (e) {
        if (i === 1 || !(e as Error).message.includes("acknowledge")) throw e;
      }
    }
    throw new Error("Request failed.");
  }
  async function act(type: string, data?: unknown, room?: string) {
    setBusy(true);
    setError("");
    try {
      await send(type, data, room);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function update(o: Outfit) {
    setDraft(o);
    draftRef.current = o;
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(async () => {
        const value = draftRef.current;
        const serialized = JSON.stringify(value);
        if (serialized !== saved.current) {
          await send("outfit", value);
          saved.current = serialized;
        }
      })
      .catch((e) => setError((e as Error).message));
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await saveChain.current;
      await send("outfit", draftRef.current);
      await send("submit");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const host = game?.hostId === game?.selfId,
    me = game?.players.find((p) => p.id === game.selfId),
    theme = THEMES[(game?.theme ?? 0) % THEMES.length],
    remaining = game?.deadline
      ? Math.max(0, game.deadline - (time + offset))
      : 0,
    countdown = `${Math.floor(remaining / 60000)
      .toString()
      .padStart(2, "0")}:${Math.floor((remaining % 60000) / 1000)
      .toString()
      .padStart(2, "0")}`;
  const styling = game?.phase === "STYLING",
    canStyle =
      !!game &&
      (game.phase === "LOBBY" ||
        (styling && game.participants.includes(game.selfId))) &&
      !game.locked;
  function select<K extends keyof Outfit>(key: K, value: Outfit[K]) {
    update({ ...draftRef.current, [key]: value });
  }
  function choices<K extends keyof Outfit>(
    key: K,
    label: string,
    values: readonly Outfit[K][],
    swatches = false,
  ) {
    return (
      <fieldset>
        <legend>{label}</legend>
        <div className={swatches ? "swatches" : "options"}>
          {values.map((v) => (
            <button
              type="button"
              key={v}
              aria-label={`${label}: ${v}`}
              aria-pressed={draft[key] === v}
              disabled={!canStyle}
              className={`${swatches ? "swatch" : "option"} ${draft[key] === v ? "selected" : ""}`}
              style={swatches ? { backgroundColor: v } : undefined}
              onClick={() => select(key, v)}
            >
              {swatches ? "" : v}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  function leave() {
    localStorage.removeItem("fr:room");
    location.href = location.pathname;
  }
  const logo = (
    <a
      className="brand"
      href="/"
      onClick={(e) => {
        if (game) {
          e.preventDefault();
          setHelp(true);
        }
      }}
    >
      <span className="brand-mark">
        F<span>R</span>
      </span>
      <span>
        FASHION ROYALE<small>2 0 9 9</small>
      </span>
    </a>
  );
  return (
    <>
      <div className="ambient" />
      <header>
        {logo}
        <nav>
          <button className="text-button" onClick={() => setHelp(true)}>
            How to play <span>↗</span>
          </button>
          <span className={`connection ${connected ? "online" : ""}`}>
            <i />
            {connected ? "LIVE NETWORK" : "CONNECTING"}
          </span>
          {game && (
            <button className="text-button" onClick={leave}>
              Exit room
            </button>
          )}
        </nav>
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {!game ? (
        <main className="landing">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              THE NEXT GENERATION OF FASHION
            </div>
            <h1>
              THE FUTURE
              <br />
              HAS A{" "}
              <em>
                DRESS
                <br />
                CODE.
              </em>
            </h1>
            <p className="intro">
              Create your look. Command the runway.
              <br />
              Compete with friends in the year 2099.
            </p>
            <div className="entry panel">
              <div className="entry-tabs">
                <button
                  className={!join ? "active" : ""}
                  onClick={() => setJoin(false)}
                >
                  Create a room
                </button>
                <button
                  className={join ? "active" : ""}
                  onClick={() => setJoin(true)}
                >
                  Join a room
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  localStorage.setItem("fr:name", name);
                  void act(
                    join ? "join" : "create",
                    { name },
                    code.toUpperCase(),
                  );
                }}
              >
                <label htmlFor="nickname">YOUR DESIGNER NAME</label>
                <input
                  id="nickname"
                  autoComplete="nickname"
                  placeholder="e.g. Nova"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  minLength={2}
                  required
                />
                {join && (
                  <>
                    <label htmlFor="room-code">ROOM CODE</label>
                    <input
                      id="room-code"
                      className="code-input"
                      placeholder="ABC123"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      minLength={6}
                      required
                    />
                  </>
                )}
                <button className="primary" disabled={busy || !connected}>
                  {busy
                    ? "Connecting…"
                    : join
                      ? "Enter the runway"
                      : "Create game"}{" "}
                  <span>↗</span>
                </button>
              </form>
              <p className="entry-note">
                2–10 PLAYERS <b>•</b> NO ACCOUNTS <b>•</b> PLAY ANYWHERE
              </p>
            </div>
            <div className="hero-footer">
              <span>01 / STYLE</span>
              <span>02 / WALK</span>
              <span>03 / VOTE</span>
            </div>
          </div>
          <div className="hero-art">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-label">
              COLLECTION 2099 <span>↗</span>
            </div>
            <div className="hero-model">
              <Avatar outfit={PRESETS[2].outfit} />
            </div>
            <div className="hero-model secondary">
              <Avatar outfit={PRESETS[0].outfit} />
            </div>
            <div className="hero-plinth" />
            <div className="floating-label">
              <i />
              HOLOGRAPHIC COUTURE<small>DESIGNED BY YOU.</small>
            </div>
            <div className="art-bottom">
              YOUR IDENTITY. REIMAGINED.<span>FR / 2099</span>
            </div>
          </div>
        </main>
      ) : (
        <main className="game-shell">
          <div className="room-bar">
            <div className="room-label">
              <span className="eyebrow">PRIVATE RUNWAY</span>
              <button
                title="Copy invite link"
                className="room-code"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(`${location.origin}/?room=${game.code}`)
                    .then(() => notify("Invite link copied"))
                    .catch(() => notify(`Room code: ${game.code}`));
                }}
              >
                {game.code} <span>⧉</span>
              </button>
            </div>
            <div className="phase-track">
              {["LOBBY", "STYLING", "RUNWAY", "VOTING", "RESULTS"].map(
                (x, i) => (
                  <React.Fragment key={x}>
                    {i > 0 && <span className="track-line" />}
                    <span
                      className={
                        game.phase === x ||
                        (game.phase === "FINAL" && x === "RESULTS")
                          ? "current"
                          : ""
                      }
                    >
                      <b>0{i + 1}</b> {x}
                    </span>
                  </React.Fragment>
                ),
              )}
            </div>
            <div className="round-info">
              {game.round
                ? `ROUND ${game.round} / ${game.config.rounds}`
                : "THE FUTURE IS YOURS"}
              <small>
                {game.players.filter((p) => p.connected).length} / 10 ONLINE
              </small>
            </div>
          </div>
          {game.phase === "LOBBY" && (
            <>
              <section className="section-heading">
                <div>
                  <div className="eyebrow">THE GUEST LIST</div>
                  <h2>Your runway awaits.</h2>
                  <p>Invite your friends. Make an entrance.</p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(game.code)
                      .then(() => notify("Room code copied"))
                      .catch(() => notify(game.code));
                  }}
                >
                  Copy room code ⧉
                </button>
              </section>
              <div className="lobby-grid">
                <section className="panel guest-panel">
                  <div className="panel-heading">
                    <span>DESIGNERS</span>
                    <span>{game.players.length} / 10</span>
                  </div>
                  <div className="guests">
                    {game.players.map((p, i) => (
                      <div className="guest" key={p.id}>
                        <div
                          className="monogram"
                          style={
                            {
                              "--accent": COLORS[i % COLORS.length],
                            } as React.CSSProperties
                          }
                        >
                          {p.name[0].toUpperCase()}
                        </div>
                        <div>
                          <strong>
                            {p.name}{" "}
                            {p.id === game.selfId && <small>YOU</small>}
                          </strong>
                          <span>
                            {p.id === game.hostId
                              ? "HOST"
                              : game.config.mode === "team"
                                ? p.team === 0
                                  ? "TEAM VIOLET"
                                  : "TEAM CYAN"
                                : "DESIGNER"}
                          </span>
                        </div>
                        <span
                          className={
                            p.connected ? "status-dot" : "status-dot offline"
                          }
                        />
                      </div>
                    ))}
                  </div>
                  {game.config.mode === "team" && (
                    <div className="team-pick">
                      <span>Your team</span>
                      {[0, 1].map((t) => (
                        <button
                          key={t}
                          className={
                            me?.team === t ? "selected option" : "option"
                          }
                          onClick={() => void act("team", t)}
                          disabled={busy}
                        >
                          {t === 0 ? "Violet" : "Cyan"}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="lobby-tip">
                    Share the room code or invite link. Friends can join from
                    any device or network.
                  </div>
                </section>
                <section className="panel settings">
                  <div className="panel-heading">
                    <span>MATCH SETTINGS</span>
                    <span>
                      {host ? "HOST CONTROLS" : "HOST IS CONFIGURING"}
                    </span>
                  </div>
                  <label>
                    Styling time
                    <select
                      aria-label="Styling time"
                      disabled={!host || busy}
                      value={game.config.minutes}
                      onChange={(e) =>
                        void act("configure", {
                          ...game.config,
                          minutes: Number(e.target.value),
                        })
                      }
                    >
                      {[2, 3, 5, 10].map((n) => (
                        <option key={n} value={n}>
                          {n} minutes
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rounds
                    <select
                      aria-label="Rounds"
                      disabled={!host || busy}
                      value={game.config.rounds}
                      onChange={(e) =>
                        void act("configure", {
                          ...game.config,
                          rounds: Number(e.target.value),
                        })
                      }
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Competition
                    <select
                      aria-label="Competition"
                      disabled={!host || busy}
                      value={game.config.mode}
                      onChange={(e) =>
                        void act("configure", {
                          ...game.config,
                          mode: e.target.value,
                        })
                      }
                    >
                      <option value="solo">Individual designers</option>
                      <option value="team">Violet vs Cyan teams</option>
                    </select>
                  </label>
                  {host ? (
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !connected ||
                        game.players.filter((p) => p.connected).length < 2
                      }
                      onClick={() => void act("start")}
                    >
                      Start competition <span>↗</span>
                    </button>
                  ) : (
                    <div className="waiting">
                      <i />
                      Waiting for the host to start
                    </div>
                  )}
                  <p className="muted">
                    {game.players.length < 2
                      ? "At least 2 players are needed to start."
                      : "Fine-tune your avatar below while everyone arrives."}
                  </p>
                </section>
              </div>
            </>
          )}
          {(game.phase === "LOBBY" || styling) && (
            <>
              <section className="studio-heading">
                <div>
                  <div className="eyebrow">
                    {styling
                      ? `CHALLENGE ${String(game.round).padStart(2, "0")}`
                      : "YOUR SIGNATURE LOOK"}
                  </div>
                  <h2>{styling ? theme.name : "The Atelier"}</h2>
                  <p>
                    {styling
                      ? theme.subtitle
                      : "Meet your muse. Build something unforgettable."}
                  </p>
                </div>
                {styling && (
                  <div
                    className={`countdown ${remaining < 30000 ? "urgent" : ""}`}
                    aria-label="Time remaining"
                  >
                    <span>STYLING ENDS IN</span>
                    <strong>{countdown}</strong>
                  </div>
                )}
              </section>
              {styling && !game.participants.includes(game.selfId) && (
                <div className="notice">
                  You’re on the guest list for next round. Enjoy the show while
                  this challenge finishes.
                </div>
              )}
              <div className="studio-grid">
                <section className="avatar-stage panel">
                  <div className="stage-label">
                    <span>LIVE PREVIEW</span>
                    <span>
                      {draft.style === "anime"
                        ? "ANIME / 02"
                        : "EDITORIAL / 01"}
                    </span>
                  </div>
                  <div className="stage-rings" />
                  <Avatar outfit={draft} />
                  <div className="stage-base" />
                  <div className="stage-caption">
                    <span>{me?.name}</span>
                    <small>
                      {game.locked ? "LOOK LOCKED" : "CUSTOM COLLECTION / 2099"}
                    </small>
                  </div>
                  {game.locked && (
                    <div className="locked-badge">✓ SUBMITTED</div>
                  )}
                </section>
                <section className="panel wardrobe">
                  <div className="panel-heading">
                    <span>THE WARDROBE</span>
                    <span role="status">
                      {!connected
                        ? "OFFLINE"
                        : canStyle
                          ? saved.current === JSON.stringify(draft)
                            ? "SAVED"
                            : "SAVING…"
                          : "LOOK LOCKED"}
                    </span>
                  </div>
                  <div
                    className="wardrobe-tabs"
                    role="tablist"
                    aria-label="Wardrobe category"
                  >
                    {["Outfits", "Avatar", "Clothing", "Details"].map((t) => (
                      <button
                        role="tab"
                        aria-selected={tab === t}
                        key={t}
                        className={tab === t ? "active" : ""}
                        onClick={() => setTab(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="wardrobe-content">
                    {tab === "Outfits" && (
                      <>
                        <p className="muted">
                          Start with a collection. Make it your own.
                        </p>
                        <div className="presets">
                          {PRESETS.map((p) => (
                            <button
                              key={p.name}
                              disabled={!canStyle}
                              onClick={() =>
                                update({
                                  ...p.outfit,
                                  skin: draft.skin,
                                  style: draft.style,
                                })
                              }
                            >
                              <Avatar outfit={p.outfit} />
                              <span>
                                {p.name} <b>↗</b>
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {tab === "Avatar" && (
                      <>
                        {choices("style", "Illustration style", [
                          "anime",
                          "editorial",
                        ])}
                        {choices("skin", "Skin tone", SKINS, true)}
                        {choices("hair", "Hairstyle", [
                          "bob",
                          "long",
                          "ponytail",
                        ])}
                        {choices("hairColor", "Hair color", HAIR_COLORS, true)}
                      </>
                    )}
                    {tab === "Clothing" && (
                      <>
                        {choices("dress", "Dress", ["none", "gown", "mini"])}
                        {draft.dress === "none" && (
                          <>
                            {choices("top", "Top", [
                              "jacket",
                              "corset",
                              "armor",
                            ])}
                            {choices("bottom", "Bottom", [
                              "trousers",
                              "skirt",
                              "shorts",
                            ])}
                          </>
                        )}
                        {choices("shoes", "Footwear", [
                          "boots",
                          "heels",
                          "sneakers",
                        ])}
                        {choices("primary", "Primary color", COLORS, true)}
                      </>
                    )}
                    {tab === "Details" && (
                      <>
                        {choices("accessory", "Accessory", [
                          "none",
                          "visor",
                          "halo",
                          "wings",
                          "headphones",
                        ])}
                        {choices("secondary", "Accent color", COLORS, true)}
                        {choices("fabric", "Fabric finish", [
                          "satin",
                          "chrome",
                          "matte",
                        ])}
                        {choices("pattern", "Pattern", [
                          "solid",
                          "circuit",
                          "stars",
                        ])}
                      </>
                    )}
                  </div>
                  {styling && (
                    <div className="submission">
                      <div>
                        <span>
                          THEME MATCH{" "}
                          <strong>+{themeBonus(draft, game.theme)} / 20</strong>
                        </span>
                        <small>Each matching detail earns +5 points</small>
                      </div>
                      <div className="theme-tags">
                        {theme.matches.map((m) => (
                          <span
                            className={
                              draft[m.key as keyof Outfit] === m.value
                                ? "match"
                                : ""
                            }
                            key={m.key}
                          >
                            {draft[m.key as keyof Outfit] === m.value
                              ? "✓ "
                              : ""}
                            {m.label}
                          </span>
                        ))}
                      </div>
                      <button
                        className="primary"
                        disabled={busy || !connected || !canStyle}
                        onClick={() => void submit()}
                      >
                        {game.locked
                          ? "✓ Look submitted & locked"
                          : "Submit your look"}{" "}
                        <span>↗</span>
                      </button>
                      <p className="muted">
                        {game.locked
                          ? "Enjoy the moment. Your runway is coming."
                          : "Your latest saved look locks automatically when time expires."}
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {game.phase === "RUNWAY" &&
            (() => {
              const index = Math.min(
                game.runwayOrder.length - 1,
                Math.max(
                  0,
                  Math.floor(
                    (time + offset - game.phaseStart) /
                      ((game.deadline! - game.phaseStart) /
                        game.runwayOrder.length),
                  ),
                ),
              );
              const model = game.players.find(
                (p) => p.id === game.runwayOrder[index],
              );
              return (
                <section className="runway-section">
                  <div className="eyebrow">
                    THE RUNWAY · {index + 1} / {game.runwayOrder.length}
                  </div>
                  <h2>{theme.name}</h2>
                  <p>The future looks good on you.</p>
                  <div className="runway">
                    <div className="runway-grid" />
                    <div className="light-beam one" />
                    <div className="light-beam two" />
                    {model?.outfit && (
                      <div className="runway-model" key={model.id}>
                        <Avatar outfit={model.outfit} pose />
                        <div className="runway-name">
                          <small>DESIGNER</small>
                          <h3>{model.name}</h3>
                        </div>
                      </div>
                    )}
                    <div className="runway-progress">
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, (1 - remaining / (game.deadline! - game.phaseStart)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="muted">
                    All screens follow the same server-timed show. Voting opens
                    next.
                  </span>
                </section>
              );
            })()}
          {game.phase === "VOTING" && (
            <>
              <section className="section-heading">
                <div>
                  <div className="eyebrow">THE JURY IS YOU</div>
                  <h2>Rate the future.</h2>
                  <p>
                    Consider creativity, theme and the complete look. Every star
                    counts.
                  </p>
                </div>
                <div className="countdown">
                  <span>VOTING ENDS IN</span>
                  <strong>{countdown}</strong>
                </div>
              </section>
              {!game.electorate.includes(game.selfId) && (
                <div className="notice">
                  You’re spectating this vote. Join the next styling challenge.
                </div>
              )}
              <div className="voting-grid">
                {game.participants.map((id) => {
                  const p = game.players.find((p) => p.id === id)!;
                  const own = id === game.selfId,
                    teammate =
                      game.config.mode === "team" && p.team === me?.team;
                  return (
                    <article className="panel vote-card" key={id}>
                      {p.outfit && <Avatar outfit={p.outfit} />}
                      <div className="vote-name">
                        <h3>{p.name}</h3>
                        <span>
                          {own
                            ? "YOUR LOOK"
                            : teammate
                              ? "YOUR TEAM"
                              : "RUNWAY LOOK"}
                        </span>
                      </div>
                      <div
                        className="stars"
                        role="group"
                        aria-label={`Rate ${p.name}`}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            aria-label={`${n} stars for ${p.name}`}
                            disabled={
                              busy ||
                              !connected ||
                              own ||
                              teammate ||
                              !game.electorate.includes(game.selfId) ||
                              game.votes[id] !== undefined
                            }
                            className={(game.votes[id] ?? 0) >= n ? "lit" : ""}
                            onClick={() =>
                              void act("vote", { target: id, stars: n })
                            }
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      <small>
                        {game.votes[id] !== undefined
                          ? `✓ Rated ${game.votes[id]} / 5`
                          : own
                            ? "Your moment in the spotlight"
                            : teammate
                              ? "Teammate ratings are disabled"
                              : "Choose once. Ratings are final."}
                      </small>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {(game.phase === "RESULTS" || game.phase === "FINAL") && (
            <section className="results">
              <div className="eyebrow">
                {game.phase === "FINAL"
                  ? "THE FUTURE HAS A NEW ICON"
                  : "THE VERDICT IS IN"}
              </div>
              <h2>
                {game.phase === "FINAL"
                  ? "A star is styled."
                  : `Round ${game.round}. Revealed.`}
              </h2>
              <p>
                {game.phase === "FINAL"
                  ? "Your collection made its mark on 2099."
                  : `Next ${game.round >= game.config.rounds ? "the final podium" : "challenge"} in ${Math.ceil(remaining / 1000)} seconds.`}
              </p>
              {game.config.mode === "team" && (
                <div className="team-results">
                  {game.teamScores.map((t) => (
                    <div className="panel" key={t.team}>
                      <span>
                        #{t.place} TEAM {t.team === 0 ? "VIOLET" : "CYAN"}
                      </span>
                      <strong>{t.score.toFixed(1)}</strong>
                      <small>AVERAGE MEMBER TOTAL</small>
                    </div>
                  ))}
                </div>
              )}
              <div className="podium">
                {game.players
                  .filter((p) => p.place === 1)
                  .map((p) => (
                    <div key={p.id}>
                      <div className="crown">♛</div>
                      {p.outfit && <Avatar outfit={p.outfit} />}
                      <h3>{p.name}</h3>
                      <span>
                        {p.total.toFixed(1)} POINTS{" "}
                        {game.players.filter((x) => x.place === 1).length > 1
                          ? "· SHARED FIRST PLACE"
                          : ""}
                      </span>
                    </div>
                  ))}
              </div>
              <div className="panel leaderboard">
                <div className="leaderboard-row table-head">
                  <span>PLACE / DESIGNER</span>
                  <span>VOTE AVG</span>
                  <span>BONUS</span>
                  <span>ROUND</span>
                  <span>TOTAL</span>
                </div>
                {game.players.map((p) => (
                  <div
                    className={`leaderboard-row ${p.id === game.selfId ? "you" : ""}`}
                    key={p.id}
                  >
                    <span>
                      <b>{String(p.place).padStart(2, "0")}</b> {p.name}
                      {p.id === game.selfId ? " · YOU" : ""}
                    </span>
                    <span>{p.average.toFixed(1)} ★</span>
                    <span>+{p.bonus}</span>
                    <span>{p.roundScore.toFixed(1)}</span>
                    <strong>{p.total.toFixed(1)}</strong>
                  </div>
                ))}
              </div>
              <p className="score-explainer">
                Round score = average rating × 20 + theme bonus (0–20). Uncast
                votes are excluded; no ratings earns 0 voting points. Ties use
                cumulative average ratings, then share placement.{" "}
                {game.config.mode === "team"
                  ? "Team standings average all roster members’ totals."
                  : ""}
              </p>
              {game.phase === "FINAL" &&
                (host ? (
                  <button
                    className="primary play-again"
                    disabled={busy || !connected}
                    onClick={() => void act("again")}
                  >
                    Design another future ↗
                  </button>
                ) : (
                  <div className="waiting">
                    Waiting for host to start another match
                  </div>
                ))}
            </section>
          )}
        </main>
      )}
      <footer>
        <span>FASHION ROYALE 2099</span>
        <span>CREATE. COMPETE. BECOME ICONIC.</span>
        <button className="text-button" onClick={() => setHelp(true)}>
          The rules ↗
        </button>
      </footer>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            className="panel help-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close how to play"
              autoFocus
              onClick={() => setHelp(false)}
            >
              ×
            </button>
            <div className="eyebrow">YOUR FIRST RUNWAY</div>
            <h2 id="help-title">How to play.</h2>
            <ol>
              <li>
                <strong>Gather your designers.</strong> Create a room and share
                its six-character code. Play with 2–10 friends on separate
                devices.
              </li>
              <li>
                <strong>Style the theme.</strong> Pick an avatar, outfit, colors
                and accessories. Theme tags each award +5 bonus points, up to
                20.
              </li>
              <li>
                <strong>Lock your look.</strong> Submit when ready. The server
                locks your latest saved look at the deadline.
              </li>
              <li>
                <strong>Walk & rate.</strong> Watch the shared runway, then rate
                each eligible look 1–5 stars. No self-votes, teammate votes or
                changes.
              </li>
              <li>
                <strong>Become iconic.</strong> Average rating × 20 + theme
                bonus determines each round’s points. Highest total wins.
              </li>
            </ol>
            <p className="muted">
              Reconnect with the same browser to reclaim your player. Late
              arrivals join the next round. If the host disconnects, another
              connected player becomes host after 20 seconds. Team standings
              average all roster members’ total scores.
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              I'm ready ↗
            </button>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
