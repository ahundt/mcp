import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import type { SocketMessageMap } from "@/types/messages/ws.types.js";

const noConnectionMessage = `No connection to browser extension. In order to proceed, you must first connect a tab by clicking the Browser MCP extension icon in the browser toolbar and clicking the 'Connect' button.`;

/**
 * Standalone Context implementation for Browser MCP.
 * - Per-instance pending map for request/response matching.
 * - Cleans up all pending requests and listeners on close.
 * - Robust error and timeout handling.
 * - No global state or external messaging dependencies.
 */
export class Context {
  private _ws?: WebSocket;
  private pending = new Map<
    string,
    {
      resolve: (v: any) => void;
      reject: (e: any) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  get ws(): WebSocket {
    if (!this._ws) throw new Error(noConnectionMessage);
    return this._ws;
  }

  set ws(ws: WebSocket) {
    if (this._ws) {
      this._ws.removeAllListeners("message");
      this._ws.removeAllListeners("close");
    }
    this._ws = ws;
    ws.on("message", this._onMessage);
    ws.on("close", this._onClose);
  }

  hasWs(): boolean {
    return !!this._ws;
  }

  private _onMessage = (data: any) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.responseFor && this.pending.has(msg.responseFor)) {
        const { resolve, timeout } = this.pending.get(msg.responseFor)!;
        clearTimeout(timeout);
        resolve(msg.payload);
        this.pending.delete(msg.responseFor);
      }
    } catch (e) {
      // Optionally log error
    }
  };

  private _onClose = () => {
    for (const { reject, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      reject(new Error("WebSocket closed before response received"));
    }
    this.pending.clear();
  };

  async sendSocketMessage<
    T extends keyof SocketMessageMap
  >(
    type: T,
    payload: SocketMessageMap[T] extends { payload: infer P } ? P : undefined,
    options: { timeoutMs?: number } = { timeoutMs: 30000 }
  ) {
    if (!this._ws) throw new Error(noConnectionMessage);
    const msgId = uuidv4();
    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(msgId);
        reject(new Error(`Timeout after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      this.pending.set(msgId, { resolve, reject, timeout });
      this._ws!.send(JSON.stringify({ msgId, type, payload }));
    });
  }

  close() {
    if (this._ws) {
      this._ws.removeAllListeners("message");
      this._ws.removeAllListeners("close");
      this._ws.close();
    }
    this._onClose();
  }
}
