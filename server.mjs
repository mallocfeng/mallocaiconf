import { createServer } from "node:http";
import fs from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const CONFIG_FILENAMES = ["openclaw.json", "clawdbot.json", "moldbot.json", "moltbot.json"];
const STATE_DIR_CANDIDATES = [".openclaw", ".clawdbot", ".moldbot", ".moltbot"];

function normalizeInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function resolveHomeDir() {
  return process.env.OPENCLAW_HOME?.trim() || os.homedir();
}

function resolveStateDirCandidates() {
  const explicit =
    process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  if (explicit) {
    return [path.resolve(explicit)];
  }
  const homeDir = resolveHomeDir();
  return STATE_DIR_CANDIDATES.map((dirname) => path.join(homeDir, dirname));
}

function resolveConfigCandidates() {
  const explicit =
    process.env.OPENCLAW_CONFIG_PATH?.trim() || process.env.CLAWDBOT_CONFIG_PATH?.trim();
  if (explicit) {
    return [path.resolve(explicit)];
  }
  const candidates = [];
  for (const stateDir of resolveStateDirCandidates()) {
    for (const filename of CONFIG_FILENAMES) {
      candidates.push(path.join(stateDir, filename));
    }
  }
  return candidates;
}

function findExistingConfigPath() {
  for (const candidate of resolveConfigCandidates()) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore broken candidates and continue.
    }
  }
  return resolveConfigCandidates()[0] ?? path.join(resolveHomeDir(), ".openclaw", "openclaw.json");
}

function normalizeAgentId(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "main";
}

function parseConfigText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
    const withoutLineComments = withoutBlockComments.replace(/(^|[^:\\])\/\/.*$/gm, "$1");
    const withoutTrailingCommas = withoutLineComments.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(withoutTrailingCommas);
  }
}

function readConfiguredAgents() {
  const configPath = findExistingConfigPath();
  let rawConfig = {};

  try {
    rawConfig = parseConfigText(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      configPath,
      agents: [],
      defaultId: "main",
    };
  }

  const entries = Array.isArray(rawConfig?.agents?.list) ? rawConfig.agents.list : [];
  const seen = new Set();
  const agents = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = normalizeAgentId(entry.id);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    agents.push({
      id,
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : undefined,
      identity:
        entry.identity && typeof entry.identity === "object"
          ? {
              name:
                typeof entry.identity.name === "string" && entry.identity.name.trim()
                  ? entry.identity.name.trim()
                  : undefined,
              emoji:
                typeof entry.identity.emoji === "string" && entry.identity.emoji.trim()
                  ? entry.identity.emoji.trim()
                  : undefined,
              theme:
                typeof entry.identity.theme === "string" && entry.identity.theme.trim()
                  ? entry.identity.theme.trim()
                  : undefined,
            }
          : undefined,
    });
  }

  const explicitDefault = entries.find((entry) => entry?.default && entry?.id)?.id;
  const defaultId = normalizeAgentId(explicitDefault || agents[0]?.id || "main");
  if (!seen.has(defaultId)) {
    agents.unshift({ id: defaultId });
  }
  if (agents.length === 0) {
    agents.push({ id: "main" });
  }

  return {
    ok: true,
    configPath,
    defaultId,
    agents,
  };
}

async function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : req.url ?? "/";
  const safePath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    json(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

await mkdir(publicDir, { recursive: true });

const port = normalizeInteger(process.env.MALLOCAICONF_PORT, 4317, {
  min: 1,
  max: 65535,
});

createServer((req, res) => {
  if (req.url === "/api/config-agents") {
    json(res, 200, {
      source: "local-config",
      ...readConfiguredAgents(),
    });
    return;
  }

  void serveStatic(req, res).catch((error) => {
    json(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}).listen(port, () => {
  process.stdout.write(`mallocaiconf listening on http://127.0.0.1:${port}\n`);
});
