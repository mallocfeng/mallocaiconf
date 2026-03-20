const PROTOCOL_VERSION = 3;
const STORAGE_KEY = "mallocaiconf.gateway.connection";
const DEVICE_IDENTITY_KEY = "mallocaiconf.gateway.deviceIdentity";
const GATEWAY_CLIENT = {
  id: "openclaw-control-ui",
  displayName: "mallocaiconf",
  version: "1.0.0",
  platform: "web",
  mode: "webchat",
};

const elements = {
  wsUrl: document.querySelector("#ws-url"),
  wsToken: document.querySelector("#ws-token"),
  connectButton: document.querySelector("#connect-button"),
  disconnectButton: document.querySelector("#disconnect-button"),
  connectionState: document.querySelector("#connection-state"),
  protocolValue: document.querySelector("#protocol-value"),
  serverVersion: document.querySelector("#server-version"),
  agentCount: document.querySelector("#agent-count"),
  relayForm: document.querySelector("#relay-form"),
  startButton: document.querySelector("#start-button"),
  stopButton: document.querySelector("#stop-button"),
  openingSpeaker: document.querySelector("#opening-speaker"),
  roundCount: document.querySelector("#round-count"),
  openingPrompt: document.querySelector("#opening-prompt"),
  stopPhrase: document.querySelector("#stop-phrase"),
  agentA: document.querySelector("#agent-a"),
  agentB: document.querySelector("#agent-b"),
  agentALabel: document.querySelector("#agent-a-label"),
  agentBLabel: document.querySelector("#agent-b-label"),
  agentAIdentity: document.querySelector("#agent-a-identity"),
  agentBIdentity: document.querySelector("#agent-b-identity"),
  agentAObjective: document.querySelector("#agent-a-objective"),
  agentBObjective: document.querySelector("#agent-b-objective"),
  agentAStyle: document.querySelector("#agent-a-style"),
  agentBStyle: document.querySelector("#agent-b-style"),
  relayState: document.querySelector("#relay-state"),
  conversationBanner: document.querySelector("#conversation-banner"),
  conversationTitle: document.querySelector("#conversation-title"),
  conversationSummary: document.querySelector("#conversation-summary"),
  conversationBadge: document.querySelector("#conversation-badge"),
  runId: document.querySelector("#run-id"),
  turnCount: document.querySelector("#turn-count"),
  lastAgent: document.querySelector("#last-agent"),
  timeline: document.querySelector("#timeline"),
  turnTemplate: document.querySelector("#turn-template"),
};

const state = {
  ws: null,
  connected: false,
  agents: [],
  agentSource: null,
  deviceIdentity: null,
  pending: new Map(),
  chatRuns: new Map(),
  challengeNonce: null,
  activeRun: null,
  stopRequested: false,
};

function saveConnectionPreferences() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      wsUrl: elements.wsUrl.value.trim(),
      wsToken: elements.wsToken.value,
    }),
  );
}

function restoreConnectionPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed.wsUrl === "string") {
      elements.wsUrl.value = parsed.wsUrl;
    }
    if (typeof parsed.wsToken === "string") {
      elements.wsToken.value = parsed.wsToken;
    }
  } catch {
    // Ignore malformed local state.
  }
}

function setConnectionState(text) {
  elements.connectionState.textContent = text;
}

function setRelayState(text) {
  elements.relayState.textContent = text;
}

function setConversationState(kind, title, summary, badge) {
  elements.conversationBanner.className = `conversation-banner ${kind}`;
  elements.conversationTitle.textContent = title;
  elements.conversationSummary.textContent = summary;
  elements.conversationBadge.textContent = badge;
}

function resetTimeline() {
  elements.timeline.innerHTML = `
    <div class="empty-state">
      <p>No conversation yet.</p>
      <p>Connect to your Gateway, load the agents, and start a dialogue.</p>
    </div>
  `;
  elements.turnCount.textContent = "0";
  elements.lastAgent.textContent = "Waiting";
  setConversationState(
    "idle",
    "Waiting to start",
    "Connect to your Gateway, choose two agents, then start the exchange.",
    "Idle",
  );
}

function clearTimelinePlaceholder() {
  const placeholder = elements.timeline.querySelector(".empty-state");
  if (placeholder) {
    placeholder.remove();
  }
}

function setFormEnabled(enabled) {
  elements.startButton.disabled = !enabled;
  elements.agentA.disabled = !enabled;
  elements.agentB.disabled = !enabled;
}

function disconnect(reason = "Disconnected.") {
  if (state.ws) {
    state.ws.onclose = null;
    state.ws.onerror = null;
    state.ws.onmessage = null;
    state.ws.close();
    state.ws = null;
  }
  state.connected = false;
  state.pending.clear();
  for (const pendingRun of state.chatRuns.values()) {
    pendingRun.reject(new Error("Gateway connection closed."));
  }
  state.chatRuns.clear();
  state.challengeNonce = null;
  state.agents = [];
  state.agentSource = null;
  setConnectionState(reason);
  elements.protocolValue.textContent = "-";
  elements.serverVersion.textContent = "-";
  elements.agentCount.textContent = "0";
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  setFormEnabled(false);
  populateAgentSelects([]);
}

function randomId(prefix = "mallocaiconf") {
  if (crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function encodeBase64Url(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestSha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

async function restoreStoredDeviceIdentity() {
  try {
    const raw = localStorage.getItem(DEVICE_IDENTITY_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.deviceId !== "string" ||
      typeof parsed?.publicKey !== "string" ||
      !parsed?.privateKeyJwk
    ) {
      return null;
    }
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      parsed.privateKeyJwk,
      "Ed25519",
      true,
      ["sign"],
    );
    return {
      deviceId: parsed.deviceId,
      publicKey: parsed.publicKey,
      privateKey,
    };
  } catch {
    return null;
  }
}

async function createStoredDeviceIdentity() {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const deviceId = bytesToHex(await digestSha256(publicKeyRaw));
  localStorage.setItem(
    DEVICE_IDENTITY_KEY,
    JSON.stringify({
      deviceId,
      publicKey: encodeBase64Url(publicKeyRaw),
      privateKeyJwk,
    }),
  );
  return {
    deviceId,
    publicKey: encodeBase64Url(publicKeyRaw),
    privateKey: keyPair.privateKey,
  };
}

async function ensureDeviceIdentity() {
  if (state.deviceIdentity) {
    return state.deviceIdentity;
  }
  state.deviceIdentity = (await restoreStoredDeviceIdentity()) ?? (await createStoredDeviceIdentity());
  return state.deviceIdentity;
}

function buildDeviceAuthPayload(params) {
  const scopes = Array.isArray(params.scopes) ? params.scopes.join(",") : "";
  const token = params.token ?? "";
  return [
    "v2",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
  ].join("|");
}

async function buildDeviceAuth(nonce, token, scopes) {
  const identity = await ensureDeviceIdentity();
  const signedAtMs = Date.now();
  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: GATEWAY_CLIENT.id,
    clientMode: GATEWAY_CLIENT.mode,
    role: "operator",
    scopes,
    signedAtMs,
    token: token || null,
    nonce,
  });
  const signature = new Uint8Array(
    await crypto.subtle.sign("Ed25519", identity.privateKey, new TextEncoder().encode(payload)),
  );
  return {
    id: identity.deviceId,
    publicKey: identity.publicKey,
    signature: encodeBase64Url(signature),
    signedAt: signedAtMs,
    nonce,
  };
}

function agentDisplayName(agent) {
  return (
    agent.identity?.name ||
    agent.name ||
    `${agent.id}${agent.identity?.emoji ? ` ${agent.identity.emoji}` : ""}`
  );
}

function populateAgentSelects(agents) {
  const previousA = elements.agentA.value;
  const previousB = elements.agentB.value;
  const renderOptions = (select, previous) => {
    select.innerHTML = "";
    for (const agent of agents) {
      const option = document.createElement("option");
      option.value = agent.id;
      option.textContent = agentDisplayName(agent);
      select.append(option);
    }
    if (agents.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No agents available";
      select.append(option);
      return;
    }
    const fallback = previous && agents.some((agent) => agent.id === previous) ? previous : agents[0].id;
    select.value = fallback;
  };
  renderOptions(elements.agentA, previousA);
  renderOptions(
    elements.agentB,
    previousB && previousB !== previousA
      ? previousB
      : agents.find((agent) => agent.id !== elements.agentA.value)?.id || previousB,
  );
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(text) {
  const codeTokens = [];
  let html = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const placeholder = `@@INLINE_CODE_${codeTokens.length}@@`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  html = html
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, href) => {
      const safeHref = escapeHtml(href);
      return `<a href="${safeHref}" target="_blank" rel="noreferrer">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");

  for (const [index, token] of codeTokens.entries()) {
    html = html.replace(`@@INLINE_CODE_${index}@@`, token);
  }
  return html;
}

function renderMarkdown(text) {
  const source = typeof text === "string" ? text.trim() : "";
  if (!source) {
    return "<p>[No text payload]</p>";
  }

  const fencedBlocks = [];
  const normalized = source.replace(/\r\n?/g, "\n").replace(
    /```([\w-]+)?\n([\s\S]*?)```/g,
    (_match, language, code) => {
      const placeholder = `@@FENCED_BLOCK_${fencedBlocks.length}@@`;
      const languageLabel = language ? `<span class="md-code-lang">${escapeHtml(language)}</span>` : "";
      fencedBlocks.push(
        `<pre class="md-code-block">${languageLabel}<code>${escapeHtml(code.trimEnd())}</code></pre>`,
      );
      return placeholder;
    },
  );

  const lines = normalized.split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^@@FENCED_BLOCK_\d+@@$/.test(trimmed)) {
      blocks.push(trimmed);
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(3, headingMatch[1].length);
      blocks.push(`<h${level}>${renderInlineMarkdown(escapeHtml(headingMatch[2]))}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderInlineMarkdown(escapeHtml(quoteLines.join("\n"))).replaceAll("\n", "<br>")}</blockquote>`);
      continue;
    }

    if (/^([-*+])\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^([-*+])\s+/.test(lines[index].trim())) {
        items.push(
          `<li>${renderInlineMarkdown(escapeHtml(lines[index].trim().replace(/^([-*+])\s+/, "")))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(
          `<li>${renderInlineMarkdown(escapeHtml(lines[index].trim().replace(/^\d+\.\s+/, "")))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const candidate = lines[index];
      const candidateTrimmed = candidate.trim();
      if (
        !candidateTrimmed ||
        /^@@FENCED_BLOCK_\d+@@$/.test(candidateTrimmed) ||
        /^(#{1,3})\s+/.test(candidateTrimmed) ||
        /^>\s?/.test(candidateTrimmed) ||
        /^([-*+])\s+/.test(candidateTrimmed) ||
        /^\d+\.\s+/.test(candidateTrimmed)
      ) {
        break;
      }
      paragraphLines.push(candidateTrimmed);
      index += 1;
    }
    blocks.push(
      `<p>${renderInlineMarkdown(escapeHtml(paragraphLines.join("\n"))).replaceAll("\n", "<br>")}</p>`,
    );
  }

  let html = blocks.join("");
  for (const [index, block] of fencedBlocks.entries()) {
    html = html.replace(`@@FENCED_BLOCK_${index}@@`, block);
  }
  return html;
}

function setTurnContent(container, text) {
  container.innerHTML = renderMarkdown(text);
}

function appendTurn(turn) {
  clearTimelinePlaceholder();
  const fragment = elements.turnTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".turn-card");
  article.dataset.runId = turn.runId;
  article.dataset.side = turn.speaker;
  fragment.querySelector(".turn-avatar-letter").textContent = turn.label.slice(0, 1).toUpperCase();
  fragment.querySelector(".turn-agent").textContent = turn.label;
  fragment.querySelector(".turn-agent-id").textContent = `${turn.agentId} · message ${turn.round}`;
  fragment.querySelector(".turn-duration").textContent = turn.durationMs
    ? `${turn.durationMs} ms`
    : "Streaming...";
  setTurnContent(fragment.querySelector(".turn-text"), turn.replyText || "[Waiting for output]");
  elements.timeline.append(fragment);
  const card = elements.timeline.querySelector(`[data-run-id="${turn.runId}"]`);
  card?.scrollIntoView({ block: "end", behavior: "smooth" });
  return card;
}

function updateTurn(runId, updates) {
  const card = elements.timeline.querySelector(`[data-run-id="${runId}"]`);
  if (!card) {
    return;
  }
  if (typeof updates.durationMs === "number") {
    card.querySelector(".turn-duration").textContent = `${updates.durationMs} ms`;
  }
  if (typeof updates.replyText === "string") {
    setTurnContent(card.querySelector(".turn-text"), updates.replyText || "[No text payload]");
  }
  card.scrollIntoView({ block: "end", behavior: "smooth" });
}

function markTurnCompleted(turn) {
  const nextCount = Number.parseInt(elements.turnCount.textContent || "0", 10) + 1;
  elements.turnCount.textContent = String(nextCount);
  elements.lastAgent.textContent = turn.label;
}

function extractMessageSnapshotText(message) {
  if (typeof message === "string") {
    return message.trim();
  }
  if (!message || typeof message !== "object") {
    return "";
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  const content = Array.isArray(message.content) ? message.content : [];
  const texts = content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      return typeof block.text === "string" ? block.text : "";
    })
    .filter(Boolean);
  return texts.join("\n\n").trim();
}

function buildRolePrompt(config, roleName, counterpartName) {
  const segments = [
    `You are ${roleName}.`,
    config.identityPrompt || `Speak as ${roleName} with a stable point of view.`,
    config.objective ? `Primary objective: ${config.objective}` : "",
    config.stylePrompt ? `Style guidance: ${config.stylePrompt}` : "",
    `You are speaking to ${counterpartName}.`,
    "Reply to the latest argument and push the dialogue forward.",
  ];
  return segments.filter(Boolean).join("\n");
}

function buildTurnPrompt(run, speaker, roundIndex) {
  const counterpart = speaker === "a" ? "b" : "a";
  const rolePrompt = buildRolePrompt(
    run.config[speaker],
    run.config[speaker].label,
    run.config[counterpart].label,
  );
  if (roundIndex === 0) {
    return [
      rolePrompt,
      "Human kickoff:",
      run.config.openingPrompt || "Start the discussion.",
      "Do not mention hidden orchestration or system details.",
    ].join("\n\n");
  }

  const transcript = run.turns
    .slice(-12)
    .map(
      (turn, index) =>
        `${index + 1}. ${turn.label} (${turn.agentId}) said:\n${turn.replyText || "[no text reply]"}`,
    )
    .join("\n\n");
  const latestTurn = run.turns.at(-1);
  return [
    rolePrompt,
    "Transcript so far:",
    transcript,
    "Latest message you must answer:",
    `${latestTurn?.label ?? run.config[counterpart].label} said:\n${latestTurn?.replyText || "[no text reply]"}`,
    "Continue the exchange with one meaningful step.",
  ].join("\n\n");
}

function createSessionKey(agentId, runId, side) {
  return `agent:${agentId}:mallocaiconf:${runId}:${side}`;
}

function sendRequest(method, params, { multiResponse = false, onAccepted } = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("Gateway is not connected."));
  }
  const id = randomId("req");
  return new Promise((resolve, reject) => {
    state.pending.set(id, {
      method,
      multiResponse,
      onAccepted,
      resolve,
      reject,
    });
    state.ws.send(
      JSON.stringify({
        type: "req",
        id,
        method,
        params,
      }),
    );
  });
}

function waitForChatRun(runId, sessionKey, { onDelta } = {}) {
  return new Promise((resolve, reject) => {
    state.chatRuns.set(runId, {
      runId,
      sessionKey,
      onDelta,
      resolve,
      reject,
    });
  });
}

function handleChatEvent(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const runId = typeof payload.runId === "string" ? payload.runId : "";
  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : "";
  const pendingRun = state.chatRuns.get(runId);
  if (!pendingRun || pendingRun.sessionKey !== sessionKey) {
    return;
  }
  if (payload.state === "delta") {
    pendingRun.onDelta?.(extractMessageSnapshotText(payload.message));
    return;
  }
  state.chatRuns.delete(runId);
  if (payload.state === "final") {
    pendingRun.resolve(payload);
    return;
  }
  if (payload.state === "aborted") {
    pendingRun.reject(new Error("Run aborted."));
    return;
  }
  if (payload.state === "error") {
    pendingRun.reject(new Error(payload.errorMessage || "Run failed."));
  }
}

async function loadAgents() {
  let gatewayError = null;

  try {
    const response = await sendRequest("agents.list", {});
    const agents = Array.isArray(response?.payload?.agents) ? response.payload.agents : [];

    if (agents.length >= 1) {
      state.agents = agents;
      state.agentSource = "gateway";
      elements.agentCount.textContent = String(agents.length);
      populateAgentSelects(agents);
      setFormEnabled(agents.length >= 2);
      return { agents, source: "gateway" };
    }
  } catch (error) {
    gatewayError = error instanceof Error ? error.message : String(error);
  }

  const fallbackResponse = await fetch("/api/config-agents", {
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!fallbackResponse.ok) {
    throw new Error("Gateway returned no agents and local config fallback failed.");
  }

  const fallbackPayload = await fallbackResponse.json();
  const fallbackAgents = Array.isArray(fallbackPayload?.agents) ? fallbackPayload.agents : [];
  state.agents = fallbackAgents;
  state.agentSource = "local-config";
  elements.agentCount.textContent = String(fallbackAgents.length);
  populateAgentSelects(fallbackAgents);
  setFormEnabled(fallbackAgents.length >= 2);
  return {
    agents: fallbackAgents,
    source: "local-config",
    configPath: fallbackPayload?.configPath,
    gatewayError,
  };
}

async function connectGateway() {
  disconnect("Connecting...");
  saveConnectionPreferences();
  const wsUrl = elements.wsUrl.value.trim();
  const token = elements.wsToken.value;
  if (!wsUrl) {
    setConnectionState("Gateway WS URL is required.");
    return;
  }

  elements.connectButton.disabled = true;
  setConnectionState("Opening socket...");
  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  ws.onopen = () => {
    setConnectionState("Socket open. Waiting for challenge...");
  };

  ws.onerror = () => {
    disconnect("WebSocket error. Check the URL, token, and Gateway reachability.");
  };

  ws.onclose = () => {
    if (state.connected) {
      disconnect("Gateway connection closed.");
    } else {
      disconnect("Gateway handshake failed or was closed.");
    }
  };

  ws.onmessage = async (event) => {
    const frame = JSON.parse(event.data);

    if (frame.type === "event" && frame.event === "connect.challenge") {
      state.challengeNonce = frame.payload?.nonce || null;
      const connectId = randomId("connect");
      state.pending.set(connectId, {
        method: "connect",
        multiResponse: false,
        resolve: async (response) => {
          try {
            const payload = response.payload || {};
            state.connected = true;
            elements.protocolValue.textContent = String(payload.protocol ?? "-");
            elements.serverVersion.textContent = payload.server?.version || "-";
            elements.connectButton.disabled = true;
            elements.disconnectButton.disabled = false;
            setConnectionState("Connected. Loading agents...");
            const agentResult = await loadAgents();
            if (agentResult.source === "gateway") {
              setConnectionState(
                `Connected. Loaded ${agentResult.agents.length} agent(s) from Gateway.`,
              );
            } else {
              const suffix = agentResult.configPath ? ` from ${agentResult.configPath}` : "";
              const cause = agentResult.gatewayError
                ? ` Gateway agents.list failed: ${agentResult.gatewayError}.`
                : " Gateway returned no agents.";
              setConnectionState(
                `Connected.${cause} Loaded ${agentResult.agents.length} agent(s) from local config${suffix}.`,
              );
            }
          } catch (error) {
            disconnect(
              `Connected, but agent loading failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
        reject: (error) => {
          disconnect(`Connect failed: ${error.message}`);
        },
      });
      ws.send(
        JSON.stringify({
          type: "req",
          id: connectId,
          method: "connect",
          params: await (async () => {
            const scopes = ["operator.admin", "operator.read", "operator.write"];
            return {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              client: GATEWAY_CLIENT,
              role: "operator",
              scopes,
              auth: token ? { token } : undefined,
              device: await buildDeviceAuth(state.challengeNonce, token, scopes),
            };
          })(),
        }),
      );
      return;
    }

    if (frame.type === "event" && frame.event === "chat") {
      handleChatEvent(frame.payload);
      return;
    }

    if (frame.type !== "res") {
      return;
    }

    const pending = state.pending.get(frame.id);
    if (!pending) {
      return;
    }

    if (!frame.ok) {
      state.pending.delete(frame.id);
      pending.reject(new Error(frame.error?.message || "Gateway request failed."));
      return;
    }

    if (pending.multiResponse) {
      const status = frame.payload?.status;
      if (status === "accepted") {
        pending.onAccepted?.(frame.payload);
        return;
      }
      state.pending.delete(frame.id);
      pending.resolve(frame);
      return;
    }

    state.pending.delete(frame.id);
    pending.resolve(frame);
  };
}

function readRunConfig() {
  const findAgent = (id) => state.agents.find((agent) => agent.id === id);
  const agentAId = elements.agentA.value;
  const agentBId = elements.agentB.value;
  if (!agentAId || !agentBId) {
    throw new Error("Choose two agents.");
  }
  if (agentAId === agentBId) {
    throw new Error("Choose two different agents.");
  }
  return {
    openingPrompt: elements.openingPrompt.value.trim(),
    rounds: Number.parseInt(elements.roundCount.value, 10) || 6,
    openingSpeaker: elements.openingSpeaker.value === "b" ? "b" : "a",
    stopPhrase: elements.stopPhrase.value.trim().toLowerCase(),
    a: {
      agentId: agentAId,
      label: elements.agentALabel.value.trim() || agentDisplayName(findAgent(agentAId)),
      identityPrompt: elements.agentAIdentity.value.trim(),
      objective: elements.agentAObjective.value.trim(),
      stylePrompt: elements.agentAStyle.value.trim(),
    },
    b: {
      agentId: agentBId,
      label: elements.agentBLabel.value.trim() || agentDisplayName(findAgent(agentBId)),
      identityPrompt: elements.agentBIdentity.value.trim(),
      objective: elements.agentBObjective.value.trim(),
      stylePrompt: elements.agentBStyle.value.trim(),
    },
  };
}

async function runRelay(config) {
  const runId = randomId("relay");
  state.activeRun = {
    id: runId,
    config,
    turns: [],
  };
  state.stopRequested = false;
  elements.runId.textContent = runId;
  elements.turnCount.textContent = "0";
  elements.lastAgent.textContent = "Starting";
  elements.startButton.disabled = true;
  elements.stopButton.disabled = false;
  setRelayState("Relay running...");
  setConversationState("running", "Conversation live", "The two agents are now exchanging messages.", "Live");

  try {
    for (let index = 0; index < config.rounds; index += 1) {
      const speaker =
        index % 2 === 0
          ? config.openingSpeaker
          : config.openingSpeaker === "a"
            ? "b"
            : "a";

      const agentConfig = config[speaker];
      const prompt = buildTurnPrompt(state.activeRun, speaker, index);
      setRelayState(`${agentConfig.label} is typing...`);
      setConversationState(
        "running",
        `${agentConfig.label} is speaking`,
        `Message ${index + 1} is being generated for ${agentConfig.label}.`,
        "Live",
      );
      const startedAt = performance.now();
      const sessionKey = createSessionKey(agentConfig.agentId, runId, speaker);
      const chatRunId = randomId(`chat-${speaker}`);
      const turn = {
        runId: chatRunId,
        round: index + 1,
        speaker,
        label: agentConfig.label,
        agentId: agentConfig.agentId,
        replyText: "",
        durationMs: null,
      };
      appendTurn(turn);
      elements.lastAgent.textContent = agentConfig.label;

      const finalEventPromise = waitForChatRun(chatRunId, sessionKey, {
        onDelta: (text) => {
          updateTurn(chatRunId, { replyText: text });
        },
      });

      const response = await sendRequest("chat.send", {
        sessionKey,
        message: prompt,
        idempotencyKey: chatRunId,
      });

      if (response.payload?.status !== "started" && response.payload?.status !== "ok") {
        throw new Error(`Unexpected chat.send status: ${response.payload?.status || "unknown"}`);
      }

      const finalEvent = await finalEventPromise;
      const replyText = extractMessageSnapshotText(finalEvent.message);
      turn.replyText = replyText;
      turn.durationMs = Math.round(performance.now() - startedAt);
      state.activeRun.turns.push(turn);
      updateTurn(chatRunId, {
        replyText,
        durationMs: turn.durationMs,
      });
      markTurnCompleted(turn);
      setRelayState(`${turn.label} finished message ${turn.round}.`);

      if (state.stopRequested) {
        setRelayState("Stopped after the current turn.");
        setConversationState(
          "stopped",
          "Conversation paused",
          `The relay stopped after ${turn.label}'s last message.`,
          "Stopped",
        );
        break;
      }
      if (config.stopPhrase && replyText.toLowerCase().includes(config.stopPhrase)) {
        setRelayState(`Stop phrase matched in round ${turn.round}.`);
        setConversationState(
          "stopped",
          "Stop phrase detected",
          `The exchange ended because ${turn.label} said the configured stop phrase.`,
          "Matched",
        );
        break;
      }

      if (index === config.rounds - 1) {
        setRelayState("Conversation complete.");
        setConversationState(
          "complete",
          "Conversation complete",
          `Both agents finished the planned ${state.activeRun.turns.length} message(s).`,
          "Done",
        );
      }
    }
  } finally {
    elements.startButton.disabled = !state.connected || state.agents.length < 2;
    elements.stopButton.disabled = true;
    state.activeRun = null;
  }
}

elements.connectButton.addEventListener("click", () => {
  void connectGateway();
});

elements.disconnectButton.addEventListener("click", () => {
  disconnect("Disconnected.");
  setRelayState("No run active.");
  elements.stopButton.disabled = true;
  elements.startButton.disabled = true;
});

elements.stopButton.addEventListener("click", () => {
  state.stopRequested = true;
  setRelayState("Will stop after the current turn.");
  setConversationState(
    "stopped",
    "Stopping after current message",
    "The relay will finish the current response and then stop cleanly.",
    "Stopping",
  );
});

elements.relayForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.connected) {
    setRelayState("Connect to the Gateway first.");
    return;
  }
  resetTimeline();
  try {
    const config = readRunConfig();
    void runRelay(config).catch((error) => {
      setRelayState(error instanceof Error ? error.message : String(error));
      setConversationState(
        "error",
        "Conversation failed",
        error instanceof Error ? error.message : String(error),
        "Error",
      );
      elements.startButton.disabled = !state.connected || state.agents.length < 2;
      elements.stopButton.disabled = true;
      state.activeRun = null;
    });
  } catch (error) {
    setRelayState(error instanceof Error ? error.message : String(error));
    setConversationState(
      "error",
      "Configuration blocked",
      error instanceof Error ? error.message : String(error),
      "Error",
    );
  }
});

restoreConnectionPreferences();
setFormEnabled(false);
resetTimeline();
