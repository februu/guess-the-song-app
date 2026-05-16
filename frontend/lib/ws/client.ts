import type { ServerMessage, ClientMessage } from "../api/messages";

function getWsBase(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_WS_URL) return process.env.NEXT_PUBLIC_BACKEND_WS_URL;
  // In production the Dockerfile bakes NEXT_PUBLIC_API_BASE="" (same-origin via reverse proxy).
  // Derive the WS URL from the current page origin so wss:// is used automatically with HTTPS.
  // In dev the var is undefined, so we fall back to the hardcoded local backend port.
  if (process.env.NEXT_PUBLIC_API_BASE === "" && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return "ws://127.0.0.1:8000";
}

type MessageHandler = (msg: ServerMessage) => void;
type BinaryHandler = (data: ArrayBuffer) => void;

class GameWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private binaryHandlers: Set<BinaryHandler> = new Set();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.ws = new WebSocket(`${getWsBase()}/ws/game/`);
      this.ws.binaryType = "arraybuffer"; 

      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("WebSocket connection failed"));

      this.ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data) as ServerMessage;
            this.handlers.forEach((h) => h(msg));
          } catch {
            // ignore malformed messages
          }
        } else if (event.data instanceof ArrayBuffer) {
          this.binaryHandlers.forEach((h) => h(event.data as ArrayBuffer));
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
    this.binaryHandlers.clear();
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const { type, data } = msg as { type: string; data: Record<string, unknown> };
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onBinary(handler: BinaryHandler): () => void {
    this.binaryHandlers.add(handler);
    return () => this.binaryHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Module-level singleton — one WS connection for the whole app
export const gameWS = new GameWebSocket();