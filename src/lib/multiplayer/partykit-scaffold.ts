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

  const clientFile = `// PartyKit multiplayer client (browser-safe)
export function createPartySession({
  host = (window.__PARTYKIT_HOST__ || "localhost:1999"),
  protocol = (window.__PARTYKIT_PROTOCOL__ || (location.protocol === "https:" ? "wss" : "ws")),
  roomType = "${roomType}",
  roomId,
  playerId = crypto.randomUUID(),
  onState,
  onPlayers,
  onEvent,
} = {}) {
  const fallbackRoomId =
    typeof window !== "undefined" && typeof window.__PARTYKIT_ROOM_ID__ === "string"
      ? window.__PARTYKIT_ROOM_ID__
      : "";
  const resolvedRoomId = roomId || fallbackRoomId;
  if (!resolvedRoomId) throw new Error("roomId is required");

  const wsUrl = \`\${protocol}://\${host}/parties/\${roomType}/\${encodeURIComponent(resolvedRoomId)}\`;
  const socket = new WebSocket(wsUrl);
  let connected = false;

  const send = (type, payload = {}) => {
    const message = JSON.stringify({ type, playerId, payload, ts: Date.now() });
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  };

  socket.addEventListener("open", () => {
    connected = true;
    send("join", { playerId });
  });

  socket.addEventListener("close", () => {
    connected = false;
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message?.type === "state" && typeof onState === "function") onState(message.payload);
    if (message?.type === "players" && typeof onPlayers === "function") onPlayers(message.payload);
    if (typeof onEvent === "function") onEvent(message);
  });

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
    sendInput(input) {
      send("input", input);
    },
    patchState(patch) {
      send("patch", patch);
    },
    updatePresence(presence) {
      send("presence", presence);
    },
    close() {
      socket.close();
    },
  };
}
`;

  const roomFile = `// PartyKit room server for room type: "${roomType}"
// Run with: pnpm dlx partykit dev
export default class GameRoom {
  constructor(room) {
    this.room = room;
    this.players = new Map();
    this.presence = {};
    this.state = {
      seed: Math.floor(Math.random() * 1000000),
      startedAt: Date.now(),
      frame: 0,
    };
  }

  onConnect(conn) {
    // Send the latest room state to newly connected clients.
    conn.send(JSON.stringify({ type: "state", payload: this.state }));
    conn.send(JSON.stringify({ type: "players", payload: Array.from(this.players.keys()) }));
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
      this.players.set(id, { id, joinedAt: Date.now() });
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
    }
  }

  onClose(conn) {
    for (const [id, player] of this.players.entries()) {
      if (player?.connId === conn.id || id === conn.id) {
        this.players.delete(id);
      }
    }
    this.broadcastPlayers();
  }

  broadcastPlayers() {
    this.room.broadcast(JSON.stringify({ type: "players", payload: Array.from(this.players.keys()) }));
  }
}
`;

  const partykitConfig = `{
  "$schema": "https://www.partykit.io/schema.json",
  "name": "game-forge-room",
  "main": "partykit/room.js",
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
      "In your game code, import src/net/party-session.js and call createPartySession({ roomId, onState, onPlayers }).",
    ],
  };
}
