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
  private ws: WebSocket | null = null; // current WebSocket connection, or null if not connected
  private handlers: Set<MessageHandler> = new Set(); // text message handlers
  private binaryHandlers: Set<BinaryHandler> = new Set(); // binary message handlers
  
  // establish a WebSocket connection, or return immediately if already connected
  connect(): Promise<void> { 
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) { 
        resolve();
        return;
      }

      this.ws = new WebSocket(`${WS_URL}/ws/game/`); // create new WebSocket connection
      this.ws.binaryType = "arraybuffer";  // expect binary messages as ArrayBuffer

      this.ws.onopen = () => resolve(); // connection established
      this.ws.onerror = () => reject(new Error("WebSocket connection failed")); // connection error

      this.ws.onmessage = (event) => { // handle incoming messages
        if (typeof event.data === "string") { // text message
          try {
            const msg = JSON.parse(event.data) as ServerMessage; // parse JSON message
            this.handlers.forEach((h) => h(msg)); // call all registered handlers with the message
          } catch {
            // ignore malformed messages
          }
        } else if (event.data instanceof ArrayBuffer) { // binary message
          this.binaryHandlers.forEach((h) => h(event.data as ArrayBuffer)); // call all registered binary handlers with the data
        }
      };

      this.ws.onclose = () => { // connection closed
        this.ws = null; // clear WebSocket reference
      };
    });
  }

  disconnect() { // close the WebSocket connection if it exists
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
    this.binaryHandlers.clear();
  }

send(msg: ClientMessage) { // send a message to the server if the connection is open
  if (this.ws?.readyState === WebSocket.OPEN) {  // only send if connection is open
    const { type, data } = msg as { type: string; data: Record<string, unknown> }; // extract type and data from the message
    const payload = JSON.stringify({ type, ...data }); // create JSON payload with type and data
    console.log("WS send:", payload);  // log the payload being sent for debugging
    this.ws.send(payload); // send the payload through the WebSocket
  }
}
  // register a handler for text messages; returns an unsubscribe function
  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  // register a handler for binary messages; returns an unsubscribe function
  onBinary(handler: BinaryHandler): () => void {
    this.binaryHandlers.add(handler);
    return () => this.binaryHandlers.delete(handler);
  }
  // check if the WebSocket connection is currently open
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Module-level singleton - one WS connection for the whole app
export const gameWS = new GameWebSocket();