const PROTOCOL_VERSION = 3;
const STORAGE_KEY = "mallocaiconf.gateway.connection";
const DEVICE_IDENTITY_KEY = "mallocaiconf.gateway.deviceIdentity";
const LOCALE_KEY = "mallocaiconf.ui.locale";
const DEFAULT_LOCALE = "zh";
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
  localeZh: document.querySelector("#locale-zh"),
  localeEn: document.querySelector("#locale-en"),
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
  locale: DEFAULT_LOCALE,
};

const DEFAULT_AGENT_LABELS = {
  zh: { a: "策略者", b: "执行者" },
  en: { a: "Strategist", b: "Builder" },
};

const MESSAGES = {
  zh: {
    pageTitle: "mallocaiconf | 双 Agent 对话台",
    "hero.title": "Gateway 双 Agent 对话台",
    "hero.lede": "直接通过 WebSocket 连接你本机已安装的 OpenClaw Gateway，选择两个 agent，在浏览器里编排多轮对话。",
    "connection.title": "Gateway 连接",
    "connection.wsUrl": "Gateway WS 地址",
    "connection.token": "Gateway Token",
    "connection.protocol": "协议",
    "connection.server": "服务端",
    "connection.agents": "Agents",
    "dialog.title": "对话设计",
    "dialog.subtitle": "模型直接使用你现有 OpenClaw 配置里的 agent 模型。",
    "dialog.openingSpeaker": "谁先开口",
    "dialog.roundCount": "消息轮数",
    "dialog.kickoff": "开场话题",
    "dialog.stopPhrase": "停止短语",
    "agent.aTitle": "Agent A",
    "agent.bTitle": "Agent B",
    "agent.choose": "选择 Agent",
    "agent.displayLabel": "显示名称",
    "agent.identityPrompt": "身份设定",
    "agent.objective": "目标",
    "agent.styleGuidance": "表达风格",
    "monitor.title": "对话监控",
    "monitor.conversationStatus": "对话状态",
    "monitor.runId": "运行 ID",
    "monitor.turns": "消息数",
    "monitor.lastAgent": "最后发言",
    "button.connect": "连接",
    "button.disconnect": "断开",
    "button.start": "开始对话",
    "button.stopAfterTurn": "本轮后停止",
    "option.agentAStarts": "Agent A 先说",
    "option.agentBStarts": "Agent B 先说",
    "placeholder.token": "粘贴 token",
    "placeholder.kickoff": "例如：讨论双 Agent 网页控制台应该如何设计得更清楚。",
    "placeholder.stopPhrase": "可选。如果 agent 说出这句话，就停止。",
    "placeholder.agentAIdentity": "例如：你偏谨慎、简洁、重视风险。",
    "placeholder.agentAObjective": "Agent A 主要优化什么？",
    "placeholder.agentAStyle": "例如：每轮都提一个更尖锐的问题。",
    "placeholder.agentBIdentity": "例如：你偏执行、具体、重视落地。",
    "placeholder.agentBObjective": "Agent B 主要优化什么？",
    "placeholder.agentBStyle": "例如：每轮最后给出一个行动建议。",
    "empty.title": "还没有开始对话。",
    "empty.body": "先连接 Gateway，加载 agents，然后开始一场对话。",
    disconnected: "已断开连接。",
    waiting: "等待中",
    noRun: "当前没有运行中的对话。",
    connectRequired: "请先连接 Gateway。",
    connecting: "正在连接...",
    wsUrlRequired: "必须填写 Gateway WS 地址。",
    openingSocket: "正在打开连接...",
    waitingChallenge: "连接已打开，等待挑战握手...",
    wsError: "WebSocket 出错，请检查地址、token 和 Gateway 是否可达。",
    gatewayClosed: "Gateway 连接已关闭。",
    handshakeFailed: "Gateway 握手失败或连接已关闭。",
    loadingAgents: "已连接，正在加载 agents...",
    localConfigLoaded: "已连接。{cause} 已从本地配置{suffix}加载 {count} 个 agent。",
    connectedGatewayAgents: "已连接。已从 Gateway 加载 {count} 个 agent。",
    connectedButLoadFailed: "已连接，但加载 agent 失败：{error}",
    connectFailed: "连接失败：{error}",
    gatewayConnectionClosed: "Gateway 连接已关闭。",
    waitingOutput: "[等待输出中]",
    noTextPayload: "[没有文本内容]",
    noAgentsAvailable: "没有可用 agent",
    gatewayNotConnected: "Gateway 尚未连接。",
    localFallbackFailed: "Gateway 没有返回 agent，且本地配置兜底读取失败。",
    chooseTwoAgents: "请选择两个 agent。",
    chooseDifferentAgents: "请选择两个不同的 agent。",
    relayRunning: "对话进行中...",
    conversationLiveTitle: "对话进行中",
    conversationLiveSummary: "两个 agent 正在持续交换消息。",
    liveBadge: "进行中",
    typingState: "{label} 正在生成回复...",
    speakingTitle: "{label} 正在发言",
    speakingSummary: "正在生成第 {count} 条消息。",
    messageLabel: "消息 {count}",
    messageFinished: "{label} 已完成第 {count} 条消息。",
    stoppedAfterTurn: "已在当前消息后停止。",
    pausedTitle: "对话已暂停",
    pausedSummary: "系统已在 {label} 的本条消息结束后停止。",
    stoppedBadge: "已停止",
    stopPhraseMatched: "第 {count} 条消息命中了停止短语。",
    stopPhraseTitle: "命中停止短语",
    stopPhraseSummary: "{label} 说出了预设停止短语，对话已结束。",
    matchedBadge: "已命中",
    conversationComplete: "对话已完成。",
    conversationCompleteTitle: "对话完成",
    conversationCompleteSummary: "两个 agent 已完成预设的 {count} 条消息。",
    doneBadge: "完成",
    stopAfterCurrent: "将在当前消息结束后停止。",
    stoppingTitle: "准备停止",
    stoppingSummary: "系统会等当前回复结束后再安全停止。",
    stoppingBadge: "停止中",
    configBlockedTitle: "配置未通过",
    conversationFailedTitle: "对话失败",
    errorBadge: "错误",
    idleTitle: "等待开始",
    idleSummary: "先连接 Gateway，选择两个 agent，然后开始对话。",
    idleBadge: "空闲",
    none: "无",
    connectionStateFallback: "未知状态",
  },
  en: {
    pageTitle: "mallocaiconf | Gateway Relay Studio",
    "hero.title": "Gateway Relay Studio",
    "hero.lede": "Connect directly to your installed OpenClaw Gateway over WebSocket, choose any two agents, and orchestrate a multi-round exchange in the browser.",
    "connection.title": "Gateway Link",
    "connection.wsUrl": "Gateway WS URL",
    "connection.token": "Gateway Token",
    "connection.protocol": "Protocol",
    "connection.server": "Server",
    "connection.agents": "Agents",
    "dialog.title": "Dialogue Design",
    "dialog.subtitle": "Models come from your existing OpenClaw config.",
    "dialog.openingSpeaker": "Opening speaker",
    "dialog.roundCount": "Round count",
    "dialog.kickoff": "Conversation kickoff",
    "dialog.stopPhrase": "Stop phrase",
    "agent.aTitle": "Agent A",
    "agent.bTitle": "Agent B",
    "agent.choose": "Choose agent",
    "agent.displayLabel": "Display label",
    "agent.identityPrompt": "Identity prompt",
    "agent.objective": "Objective",
    "agent.styleGuidance": "Style guidance",
    "monitor.title": "Relay Monitor",
    "monitor.conversationStatus": "Conversation Status",
    "monitor.runId": "Run ID",
    "monitor.turns": "Turns",
    "monitor.lastAgent": "Last agent",
    "button.connect": "Connect",
    "button.disconnect": "Disconnect",
    "button.start": "Start Relay",
    "button.stopAfterTurn": "Stop After Turn",
    "option.agentAStarts": "Agent A starts",
    "option.agentBStarts": "Agent B starts",
    "placeholder.token": "Paste token",
    "placeholder.kickoff": "Example: Debate how a dual-agent web console should feel clearer.",
    "placeholder.stopPhrase": "Optional. If an agent says this, the relay halts.",
    "placeholder.agentAIdentity": "Example: You are skeptical, concise, and risk-focused.",
    "placeholder.agentAObjective": "What should Agent A optimize for?",
    "placeholder.agentAStyle": "Example: Ask one sharper follow-up each turn.",
    "placeholder.agentBIdentity": "Example: You are implementation-driven and concrete.",
    "placeholder.agentBObjective": "What should Agent B optimize for?",
    "placeholder.agentBStyle": "Example: End with one actionable recommendation.",
    "empty.title": "No conversation yet.",
    "empty.body": "Connect to your Gateway, load the agents, and start a dialogue.",
    disconnected: "Disconnected.",
    waiting: "Waiting",
    noRun: "No run active.",
    connectRequired: "Connect to the Gateway first.",
    connecting: "Connecting...",
    wsUrlRequired: "Gateway WS URL is required.",
    openingSocket: "Opening socket...",
    waitingChallenge: "Socket open. Waiting for challenge...",
    wsError: "WebSocket error. Check the URL, token, and Gateway reachability.",
    gatewayClosed: "Gateway connection closed.",
    handshakeFailed: "Gateway handshake failed or was closed.",
    loadingAgents: "Connected. Loading agents...",
    localConfigLoaded: "Connected.{cause} Loaded {count} agent(s) from local config{suffix}.",
    connectedGatewayAgents: "Connected. Loaded {count} agent(s) from Gateway.",
    connectedButLoadFailed: "Connected, but agent loading failed: {error}",
    connectFailed: "Connect failed: {error}",
    gatewayConnectionClosed: "Gateway connection closed.",
    waitingOutput: "[Waiting for output]",
    noTextPayload: "[No text payload]",
    noAgentsAvailable: "No agents available",
    gatewayNotConnected: "Gateway is not connected.",
    localFallbackFailed: "Gateway returned no agents and local config fallback failed.",
    chooseTwoAgents: "Choose two agents.",
    chooseDifferentAgents: "Choose two different agents.",
    relayRunning: "Relay running...",
    conversationLiveTitle: "Conversation live",
    conversationLiveSummary: "The two agents are now exchanging messages.",
    liveBadge: "Live",
    typingState: "{label} is typing...",
    speakingTitle: "{label} is speaking",
    speakingSummary: "Generating message {count}.",
    messageLabel: "message {count}",
    messageFinished: "{label} finished message {count}.",
    stoppedAfterTurn: "Stopped after the current turn.",
    pausedTitle: "Conversation paused",
    pausedSummary: "The relay stopped after {label}'s current message.",
    stoppedBadge: "Stopped",
    stopPhraseMatched: "Stop phrase matched in message {count}.",
    stopPhraseTitle: "Stop phrase detected",
    stopPhraseSummary: "The exchange ended because {label} said the configured stop phrase.",
    matchedBadge: "Matched",
    conversationComplete: "Conversation complete.",
    conversationCompleteTitle: "Conversation complete",
    conversationCompleteSummary: "Both agents finished the planned {count} message(s).",
    doneBadge: "Done",
    stopAfterCurrent: "Will stop after the current turn.",
    stoppingTitle: "Stopping after current message",
    stoppingSummary: "The relay will finish the current response and then stop cleanly.",
    stoppingBadge: "Stopping",
    configBlockedTitle: "Configuration blocked",
    conversationFailedTitle: "Conversation failed",
    errorBadge: "Error",
    idleTitle: "Waiting to start",
    idleSummary: "Connect to your Gateway, choose two agents, then start the exchange.",
    idleBadge: "Idle",
    none: "None",
    connectionStateFallback: "Unknown state",
  },
};

function t(key, vars = {}) {
  const bundle = MESSAGES[state.locale] ?? MESSAGES[DEFAULT_LOCALE];
  const template = bundle[key] ?? MESSAGES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(vars[name] ?? ""));
}

function restoreLocalePreference() {
  const saved = localStorage.getItem(LOCALE_KEY);
  state.locale = saved === "en" ? "en" : DEFAULT_LOCALE;
}

function saveLocalePreference() {
  localStorage.setItem(LOCALE_KEY, state.locale);
}

function updateLocaleButtons() {
  elements.localeZh.classList.toggle("active", state.locale === "zh");
  elements.localeEn.classList.toggle("active", state.locale === "en");
  elements.localeZh.setAttribute("aria-pressed", String(state.locale === "zh"));
  elements.localeEn.setAttribute("aria-pressed", String(state.locale === "en"));
}

function syncDefaultAgentLabels() {
  for (const [side, input] of [
    ["a", elements.agentALabel],
    ["b", elements.agentBLabel],
  ]) {
    const defaults = new Set(Object.values(DEFAULT_AGENT_LABELS.zh).concat(Object.values(DEFAULT_AGENT_LABELS.en)));
    if (!input.dataset.userEdited || defaults.has(input.value)) {
      input.value = DEFAULT_AGENT_LABELS[state.locale][side];
      delete input.dataset.userEdited;
    }
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = state.locale === "zh" ? "zh-CN" : "en";
  document.title = t("pageTitle");
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  }
  syncDefaultAgentLabels();
  updateLocaleButtons();
}

function applyLocale(locale) {
  state.locale = locale === "en" ? "en" : "zh";
  saveLocalePreference();
  applyStaticTranslations();
  if (!state.connected) {
    setConnectionState(t("disconnected"));
  }
  if (!state.activeRun) {
    resetTimeline();
  }
}

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
      <p>${t("empty.title")}</p>
      <p>${t("empty.body")}</p>
    </div>
  `;
  elements.runId.textContent = t("none");
  elements.turnCount.textContent = "0";
  elements.lastAgent.textContent = t("waiting");
  setRelayState(t("noRun"));
  setConversationState(
    "idle",
    t("idleTitle"),
    t("idleSummary"),
    t("idleBadge"),
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

function disconnect(reason = t("disconnected")) {
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
      option.textContent = t("noAgentsAvailable");
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
    return `<p>${t("noTextPayload")}</p>`;
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
  fragment.querySelector(".turn-agent-id").textContent = `${turn.agentId} · ${t("messageLabel", { count: turn.round })}`;
  fragment.querySelector(".turn-duration").textContent = turn.durationMs
    ? `${turn.durationMs} ms`
    : "Streaming...";
  setTurnContent(fragment.querySelector(".turn-text"), turn.replyText || t("waitingOutput"));
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
    setTurnContent(card.querySelector(".turn-text"), updates.replyText || t("noTextPayload"));
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
    return Promise.reject(new Error(t("gatewayNotConnected")));
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
    pendingRun.reject(new Error(state.locale === "zh" ? "运行已中止。" : "Run aborted."));
    return;
  }
  if (payload.state === "error") {
    pendingRun.reject(new Error(payload.errorMessage || (state.locale === "zh" ? "运行失败。" : "Run failed.")));
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
    throw new Error(t("localFallbackFailed"));
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
  disconnect(t("connecting"));
  saveConnectionPreferences();
  const wsUrl = elements.wsUrl.value.trim();
  const token = elements.wsToken.value;
  if (!wsUrl) {
    setConnectionState(t("wsUrlRequired"));
    return;
  }

  elements.connectButton.disabled = true;
  setConnectionState(t("openingSocket"));
  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  ws.onopen = () => {
    setConnectionState(t("waitingChallenge"));
  };

  ws.onerror = () => {
    disconnect(t("wsError"));
  };

  ws.onclose = () => {
    if (state.connected) {
      disconnect(t("gatewayClosed"));
    } else {
      disconnect(t("handshakeFailed"));
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
            setConnectionState(t("loadingAgents"));
            const agentResult = await loadAgents();
            if (agentResult.source === "gateway") {
              setConnectionState(t("connectedGatewayAgents", { count: agentResult.agents.length }));
            } else {
              const suffix = agentResult.configPath ? ` from ${agentResult.configPath}` : "";
              const cause = agentResult.gatewayError
                ? ` Gateway agents.list failed: ${agentResult.gatewayError}.`
                : " Gateway returned no agents.";
              setConnectionState(
                t("localConfigLoaded", {
                  cause,
                  count: agentResult.agents.length,
                  suffix,
                }),
              );
            }
          } catch (error) {
            disconnect(
              t("connectedButLoadFailed", {
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        },
        reject: (error) => {
          disconnect(t("connectFailed", { error: error.message }));
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
      pending.reject(new Error(frame.error?.message || t("gatewayConnectionClosed")));
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
    throw new Error(t("chooseTwoAgents"));
  }
  if (agentAId === agentBId) {
    throw new Error(t("chooseDifferentAgents"));
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
  elements.lastAgent.textContent = t("waiting");
  elements.startButton.disabled = true;
  elements.stopButton.disabled = false;
  setRelayState(t("relayRunning"));
  setConversationState(
    "running",
    t("conversationLiveTitle"),
    t("conversationLiveSummary"),
    t("liveBadge"),
  );

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
      setRelayState(t("typingState", { label: agentConfig.label }));
      setConversationState(
        "running",
        t("speakingTitle", { label: agentConfig.label }),
        t("speakingSummary", { count: index + 1, label: agentConfig.label }),
        t("liveBadge"),
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
      setRelayState(t("messageFinished", { label: turn.label, count: turn.round }));

      if (state.stopRequested) {
        setRelayState(t("stoppedAfterTurn"));
        setConversationState(
          "stopped",
          t("pausedTitle"),
          t("pausedSummary", { label: turn.label }),
          t("stoppedBadge"),
        );
        break;
      }
      if (config.stopPhrase && replyText.toLowerCase().includes(config.stopPhrase)) {
        setRelayState(t("stopPhraseMatched", { count: turn.round }));
        setConversationState(
          "stopped",
          t("stopPhraseTitle"),
          t("stopPhraseSummary", { label: turn.label }),
          t("matchedBadge"),
        );
        break;
      }

      if (index === config.rounds - 1) {
        setRelayState(t("conversationComplete"));
        setConversationState(
          "complete",
          t("conversationCompleteTitle"),
          t("conversationCompleteSummary", { count: state.activeRun.turns.length }),
          t("doneBadge"),
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

elements.localeZh.addEventListener("click", () => {
  applyLocale("zh");
});

elements.localeEn.addEventListener("click", () => {
  applyLocale("en");
});

elements.disconnectButton.addEventListener("click", () => {
  disconnect(t("disconnected"));
  setRelayState(t("noRun"));
  elements.stopButton.disabled = true;
  elements.startButton.disabled = true;
});

elements.stopButton.addEventListener("click", () => {
  state.stopRequested = true;
  setRelayState(t("stopAfterCurrent"));
  setConversationState(
    "stopped",
    t("stoppingTitle"),
    t("stoppingSummary"),
    t("stoppingBadge"),
  );
});

elements.relayForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.connected) {
    setRelayState(t("connectRequired"));
    return;
  }
  resetTimeline();
  try {
    const config = readRunConfig();
    void runRelay(config).catch((error) => {
      setRelayState(error instanceof Error ? error.message : String(error));
      setConversationState(
        "error",
        t("conversationFailedTitle"),
        error instanceof Error ? error.message : String(error),
        t("errorBadge"),
      );
      elements.startButton.disabled = !state.connected || state.agents.length < 2;
      elements.stopButton.disabled = true;
      state.activeRun = null;
    });
  } catch (error) {
    setRelayState(error instanceof Error ? error.message : String(error));
    setConversationState(
      "error",
      t("configBlockedTitle"),
      error instanceof Error ? error.message : String(error),
      t("errorBadge"),
    );
  }
});

for (const input of [elements.agentALabel, elements.agentBLabel]) {
  input.addEventListener("input", () => {
    input.dataset.userEdited = "true";
  });
}

restoreLocalePreference();
restoreConnectionPreferences();
applyStaticTranslations();
setFormEnabled(false);
resetTimeline();
setConnectionState(t("disconnected"));
