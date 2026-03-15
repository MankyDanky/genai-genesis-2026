export interface MultiplayerScaffoldFile {
  path: string;
  kind: "script" | "config" | "other";
  content: string;
}

export interface MultiplayerScaffold {
  provider: "partykit";
  roomType: string;
  files: MultiplayerScaffoldFile[];
  quickStart: string[];
}

function sanitizeRoomType(roomType: string): string {
  const cleaned = roomType.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return cleaned.length > 0 ? cleaned : "game";
}

export function buildPartyKitScaffold(inputRoomType = "game"): MultiplayerScaffold {
  const roomType = sanitizeRoomType(inputRoomType);

  const clientFile = `// PartyKit multiplayer client (browser-safe, non-module)
(function () {
function createPartySession({
  host = (window.__PARTYKIT_HOST__ || "localhost:1999"),
  protocol = (window.__PARTYKIT_PROTOCOL__ || ""),
  roomType = "${roomType}",
  roomId,
  playerId = crypto.randomUUID(),
  onState,
  onPlayers,
  onPlayerState,
  onEvent,
} = {}) {
  const fallbackRoomId =
    typeof window !== "undefined" && typeof window.__PARTYKIT_ROOM_ID__ === "string"
      ? window.__PARTYKIT_ROOM_ID__
      : "";
  const resolvedRoomId = roomId || fallbackRoomId;
  if (!resolvedRoomId) throw new Error("roomId is required");
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const resolvedProtocol =
    protocol ||
    (location.protocol === "https:" || !isLocalHost ? "wss" : "ws");

  const wsCandidates = [
    \`\${resolvedProtocol}://\${host}/parties/\${roomType}/\${encodeURIComponent(resolvedRoomId)}\`,
    \`\${resolvedProtocol}://\${host}/parties/game/\${encodeURIComponent(resolvedRoomId)}\`,
    \`\${resolvedProtocol}://\${host}/party/\${encodeURIComponent(resolvedRoomId)}\`,
  ];
  let socket = null;
  let connected = false;
  let currentWsUrl = "";
  let closedManually = false;
  let candidateIndex = 0;
  const players = new Map();
  let roomState = {};

  const send = (type, payload = {}) => {
    const message = JSON.stringify({ type, playerId, payload, ts: Date.now() });
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(message);
  };

  const connectAt = (index) => {
    if (index >= wsCandidates.length) {
      if (typeof onEvent === "function") {
        onEvent({ type: "connection_error", payload: { tried: wsCandidates } });
      }
      return;
    }

    candidateIndex = index;
    currentWsUrl = wsCandidates[index];
    socket = new WebSocket(currentWsUrl);

    socket.addEventListener("open", () => {
      connected = true;
      send("join", { playerId });
      if (typeof onEvent === "function") {
        onEvent({ type: "connected", payload: { wsUrl: currentWsUrl, candidateIndex } });
      }
    });

    socket.addEventListener("close", () => {
      const wasConnected = connected;
      connected = false;
      if (!closedManually && !wasConnected) {
        connectAt(index + 1);
      }
    });

    socket.addEventListener("error", () => {
      if (typeof onEvent === "function") {
        onEvent({ type: "socket_error", payload: { wsUrl: currentWsUrl, candidateIndex } });
      }
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message?.type === "state") {
        roomState = message.payload || {};
        if (typeof onState === "function") onState(roomState);
      }

      if (message?.type === "players") {
        const list = Array.isArray(message.payload) ? message.payload : [];
        const nextIds = new Set(list.map((item) => item?.id || item).filter(Boolean));
        for (const id of Array.from(players.keys())) {
          if (!nextIds.has(id)) players.delete(id);
        }
        for (const raw of list) {
          const id = raw?.id || raw;
          if (!id) continue;
          const prev = players.get(id) || {};
          const merged = typeof raw === "object" ? { ...prev, ...raw, id } : { ...prev, id };
          players.set(id, merged);
        }
        if (typeof onPlayers === "function") onPlayers(Array.from(players.values()));
      }

      if (message?.type === "player_state") {
        const payload = message.payload || {};
        const id = payload.id || message.playerId;
        if (id) {
          const prev = players.get(id) || { id };
          const merged = { ...prev, ...payload, id };
          players.set(id, merged);
          if (typeof onPlayerState === "function") onPlayerState(merged);
          if (typeof onPlayers === "function") onPlayers(Array.from(players.values()));
        }
      }

      if (message?.type === "presence") {
        const table = message.payload || {};
        for (const id of Object.keys(table)) {
          const prev = players.get(id) || { id };
          players.set(id, { ...prev, presence: table[id] });
        }
        if (typeof onPlayers === "function") onPlayers(Array.from(players.values()));
      }

      if (typeof onEvent === "function") onEvent(message);
    });
  };

  connectAt(0);

  return {
    get playerId() {
      return playerId;
    },
    get roomId() {
      return resolvedRoomId;
    },
    get connected() {
      return connected;
    },
    get wsUrl() {
      return currentWsUrl;
    },
    getState() {
      return roomState;
    },
    getPlayers() {
      return Array.from(players.values());
    },
    getPlayer(id) {
      return players.get(id) || null;
    },
    sendInput(input) {
      send("input", input);
    },
    patchState(patch) {
      send("patch", patch);
    },
    updatePresence(presence) {
      send("presence", presence);
    },
    updatePlayerState(patch) {
      send("player_state", patch);
    },
    close() {
      closedManually = true;
      if (socket) socket.close();
    },
  };
}

window.GameForgePartySession = { createPartySession };
})();
`;

  const roomFile = `// PartyKit room server for room type: "${roomType}"
// Run with: pnpm dlx partykit dev
export default class GameRoom {
  constructor(room) {
    this.room = room;
    this.players = new Map();
    this.presence = {};
    this.playerState = {};
    this.state = {
      seed: Math.floor(Math.random() * 1000000),
      startedAt: Date.now(),
      frame: 0,
    };
  }

  onConnect(conn) {
    // Send the latest room state to newly connected clients.
    conn.send(JSON.stringify({ type: "state", payload: this.state }));
    conn.send(JSON.stringify({ type: "players", payload: this.getPlayersPayload() }));
    conn.send(JSON.stringify({ type: "presence", payload: this.presence }));
  }

  onMessage(raw, sender) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg?.type === "join") {
      const id = msg.playerId || sender.id;
      this.players.set(id, { id, connId: sender.id, joinedAt: Date.now() });
      this.playerState[id] = this.playerState[id] || { id };
      this.broadcastPlayers();
      return;
    }

    if (msg?.type === "presence") {
      const id = msg.playerId || sender.id;
      this.presence[id] = msg.payload || {};
      this.room.broadcast(JSON.stringify({ type: "presence", payload: this.presence }));
      return;
    }

    if (msg?.type === "patch") {
      this.state = { ...this.state, ...(msg.payload || {}), frame: (this.state.frame || 0) + 1 };
      this.room.broadcast(JSON.stringify({ type: "state", payload: this.state }));
      return;
    }

    if (msg?.type === "input") {
      this.room.broadcast(
        JSON.stringify({
          type: "input",
          playerId: msg.playerId || sender.id,
          payload: msg.payload || {},
          ts: msg.ts || Date.now(),
        })
      );
      return;
    }

    if (msg?.type === "player_state") {
      const id = msg.playerId || sender.id;
      const patch = msg.payload || {};
      const next = { ...(this.playerState[id] || { id }), ...patch, id, updatedAt: Date.now() };
      this.playerState[id] = next;
      this.room.broadcast(JSON.stringify({ type: "player_state", playerId: id, payload: next }));
    }
  }

  onClose(conn) {
    for (const [id, player] of this.players.entries()) {
      if (player?.connId === conn.id || id === conn.id) {
        this.players.delete(id);
        delete this.playerState[id];
        delete this.presence[id];
      }
    }
    this.broadcastPlayers();
    this.room.broadcast(JSON.stringify({ type: "presence", payload: this.presence }));
  }

  broadcastPlayers() {
    this.room.broadcast(JSON.stringify({ type: "players", payload: this.getPlayersPayload() }));
  }

  getPlayersPayload() {
    return Array.from(this.players.keys()).map((id) => {
      const base = this.players.get(id) || { id };
      return {
        id,
        ...base,
        state: this.playerState[id] || null,
        presence: this.presence[id] || null,
      };
    });
  }
}
`;

  const partykitConfig = `{
  "$schema": "https://www.partykit.io/schema.json",
  "name": "game-forge-room",
  "main": "partykit/room.js",
  "parties": {
    "game": "partykit/room.js"
  },
  "compatibilityDate": "2026-03-14"
}
`;

  return {
    provider: "partykit",
    roomType,
    files: [
      { path: "src/net/party-session.js", kind: "script", content: clientFile },
      { path: "partykit/room.js", kind: "script", content: roomFile },
      { path: "partykit.json", kind: "config", content: partykitConfig },
    ],
    quickStart: [
      "Set NEXT_PUBLIC_PARTYKIT_HOST (for local dev use localhost:1999).",
      "Run PartyKit room server with: pnpm dlx partykit dev",
      "In index.html, include <script src=\"src/net/party-session.js\"></script>, then call window.GameForgePartySession.createPartySession({ roomId, onState, onPlayers, onPlayerState }).",
      "Use session.getPlayers()/getPlayer(id) for rendering remote players, and session.updatePlayerState({ x, y, ... }) to replicate local player motion.",
    ],
  };
}
