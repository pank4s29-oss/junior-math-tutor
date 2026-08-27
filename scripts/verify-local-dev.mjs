import { spawn } from "node:child_process";

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const isWindows = process.platform === "win32";
const apiPort = "3101";
const webPort = "5178";
const children = [];

function start(name, args) {
  const child = spawn(packageManager, args, {
    env: { ...process.env, TUTOR_API_PORT: apiPort },
    stdio: ["ignore", "pipe", "pipe"],
    detached: !isWindows,
  });
  children.push(child);
  child.stdout.on("data", chunk => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", chunk => process.stderr.write(`[${name}] ${chunk}`));
  return child;
}

async function waitFor(url, label) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${label} 回傳 HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`${label} 未在 15 秒內啟動：${String(lastError)}`);
}

try {
  start("api", ["exec", "tsx", "server/standalone.ts"]);
  await waitFor(`http://127.0.0.1:${apiPort}/api/trpc/system.health?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22timestamp%22%3A1%7D%7D%7D`, "本機 API");

  start("web", ["exec", "vite", "--host", "127.0.0.1", "--port", webPort]);
  const response = await waitFor(`http://127.0.0.1:${webPort}/api/trpc/system.health?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22timestamp%22%3A1%7D%7D%7D`, "Vite proxy");
  const body = await response.text();
  if (!body.includes('"ok":true')) throw new Error("Vite proxy 未取得預期的 tRPC 健康回應。");
  console.log("Verified local portable development: Vite /api proxy → Express tRPC → { ok: true }");
} finally {
  for (const child of children) {
    if (!child.pid) continue;
    if (isWindows) child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  }
}
