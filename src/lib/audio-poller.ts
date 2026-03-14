/**
 * Module-level audio poller — completely outside React.
 * Polls /api/sounds/:id and calls onUpdate when status changes.
 * Never causes re-renders except when audio actually becomes ready/error.
 */

type AudioUpdate = {
  id: string;
  status: "ready" | "error";
  dataUrl?: string;
  duration?: number;
  error?: string;
};

type UpdateCallback = (update: AudioUpdate) => void;

interface PollState {
  timerId: ReturnType<typeof setTimeout> | null;
  retries: number;
  startedAt: number;
}

const MAX_RETRIES = 5;
const MAX_WAIT_MS = 3 * 60 * 1000;
const BASE_POLL_MS = 2200;

class AudioPoller {
  private polls = new Map<string, PollState>();
  private onUpdate: UpdateCallback | null = null;

  setCallback(cb: UpdateCallback) {
    this.onUpdate = cb;
  }

  register(id: string) {
    if (this.polls.has(id)) return;
    const state: PollState = { timerId: null, retries: 0, startedAt: Date.now() };
    this.polls.set(id, state);
    this.poll(id, state);
  }

  unregister(id: string) {
    const state = this.polls.get(id);
    if (state?.timerId) clearTimeout(state.timerId);
    this.polls.delete(id);
  }

  private async poll(id: string, state: PollState) {
    try {
      const res = await fetch(`/api/sounds/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const payload = await res.json() as {
        status?: "pending" | "ready" | "error";
        dataUrl?: string | null;
        duration?: number | null;
        error?: string | null;
      };

      const nextStatus = payload.status ?? "pending";
      state.retries = 0;

      if (nextStatus === "ready" && payload.dataUrl) {
        this.onUpdate?.({ id, status: "ready", dataUrl: payload.dataUrl, duration: payload.duration ?? undefined });
        this.polls.delete(id);
        return;
      }

      if (nextStatus === "error") {
        this.onUpdate?.({ id, status: "error", error: payload.error ?? "Generation failed" });
        this.polls.delete(id);
        return;
      }

      // Still pending — check max wait
      if (Date.now() - state.startedAt > MAX_WAIT_MS) {
        this.onUpdate?.({ id, status: "error", error: "Audio generation timed out" });
        this.polls.delete(id);
        return;
      }

      state.timerId = setTimeout(() => this.poll(id, state), BASE_POLL_MS);
    } catch {
      state.retries += 1;
      if (state.retries >= MAX_RETRIES) {
        this.onUpdate?.({ id, status: "error", error: "Failed to fetch audio status" });
        this.polls.delete(id);
        return;
      }
      const backoff = Math.min(2000 * state.retries, 10000);
      state.timerId = setTimeout(() => this.poll(id, state), backoff);
    }
  }
}

export const audioPoller = new AudioPoller();
