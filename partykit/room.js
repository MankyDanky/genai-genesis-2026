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
      this.players.set(id, { id, connId: sender.id, joinedAt: Date.now() });
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

