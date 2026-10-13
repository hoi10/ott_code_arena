// Live HTTP smoke test against a running server (PORT env, default 3999).
// Exercises the tournament API end to end, then reports the tournament id so
// the caller can clean it up. Run with: node scripts/http-tournament-test.js
const BASE = `http://127.0.0.1:${process.env.PORT || 3999}/api`;
const stamp = Date.now();

async function j(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(BASE + path, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const BOT =
  "const p = input.pieces.own[0]; return p ? { pieceId: p.id, to: { x: p.x + 1, y: p.y } } : null;";

async function main() {
  const tokens = [];
  const botIds = [];
  for (let i = 0; i < 3; i += 1) {
    await j("/auth/register", {
      method: "POST",
      body: { username: `http_${stamp}_${i}`, email: `http_${stamp}_${i}@ex.com`, password: "password123" },
    });
    const login = await j("/auth/login", {
      method: "POST",
      body: { email: `http_${stamp}_${i}@ex.com`, password: "password123" },
    });
    tokens.push(login.data?.data?.token);
    const bot = await j("/bots", {
      method: "POST",
      token: tokens[i],
      body: { name: `http-bot-${stamp}-${i}`, sourceCode: BOT, language: "javascript" },
    });
    botIds.push(bot.data?.data?.bot?.id ?? bot.data?.data?.id);
  }

  const create = await j("/tournaments", {
    method: "POST",
    token: tokens[0],
    body: { name: `HTTP Cup ${stamp}`, description: "via http test" },
  });
  const tid = create.data?.data?.tournament?.id;
  console.log("create:", create.status, "tid=", tid);

  for (let i = 0; i < 3; i += 1) {
    const add = await j(`/tournaments/${tid}/participants`, {
      method: "POST",
      token: tokens[i],
      body: { botId: botIds[i] },
    });
    console.log(`add participant ${i}:`, add.status, add.data?.message || "");
  }

  const lock = await j(`/tournaments/${tid}/lock`, { method: "POST", token: tokens[0] });
  console.log("lock:", lock.status, lock.data?.message || "", "status=", lock.data?.data?.tournament?.status);

  const get = await j(`/tournaments/${tid}`, { token: tokens[1] });
  console.log(
    "get detail (non-host):",
    get.status,
    "rounds=",
    get.data?.data?.tournament?.rounds?.length,
    "standings=",
    get.data?.data?.tournament?.standings?.length
  );

  const start = await j(`/tournaments/${tid}/start`, { method: "POST", token: tokens[0] });
  console.log("start:", start.status, start.data?.message || "");

  const forbidden = await j(`/tournaments/${tid}/cancel`, { method: "POST", token: tokens[1] });
  console.log("non-host cancel (expect 403):", forbidden.status, forbidden.data?.message || "");

  console.log("TID_FOR_CLEANUP=" + tid);
}

main().catch((error) => {
  console.error("HTTP test failed:", error);
  process.exitCode = 1;
});
