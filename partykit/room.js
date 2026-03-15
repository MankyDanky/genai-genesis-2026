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
