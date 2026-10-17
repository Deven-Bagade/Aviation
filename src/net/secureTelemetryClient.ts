/**
 * Client for the authenticated telemetry WebSocket (electron/telemetry-server.js).
 * Not wired into the live demo yet — the demo still uses the in-process
 * simulator in simulation/telemetryEngine.ts. Use this once a real
 * CAN/ECU adapter is feeding telemetry-server.js.
 */

import { EngineCommand, Telemetry } from "../types";

type SignedEnvelope<T> = { payload: T; sig: string };

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class SecureTelemetryClient {
  private ws: WebSocket | null = null;
  private secret: string;
  private url: string;
  private listeners = new Set<(t: Telemetry) => void>();

  constructor(url: string, secret: string) {
    this.url = url;
    this.secret = secret;
  }

  async connect(): Promise<void> {
    const bucket = Math.floor(Date.now() / 60000);
    const token = this.secret ? await hmacHex(this.secret, String(bucket)) : "";

    this.ws = new WebSocket(`${this.url}?token=${token}`);

    this.ws.onmessage = async (event) => {
      const envelope: SignedEnvelope<Telemetry> = JSON.parse(event.data);
      if (this.secret) {
        const expected = await hmacHex(this.secret, JSON.stringify(envelope.payload));
        if (expected !== envelope.sig) {
          console.warn("[SecureTelemetryClient] dropped frame: signature mismatch");
          return;
        }
      }
      this.listeners.forEach((cb) => cb(envelope.payload));
    };

    this.ws.onclose = (e) => console.warn("[SecureTelemetryClient] closed:", e.code, e.reason);
  }

  async sendCommand(command: EngineCommand): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const sig = this.secret ? await hmacHex(this.secret, JSON.stringify(command)) : "";
    this.ws.send(JSON.stringify({ payload: command, sig }));
  }

  subscribe(cb: (t: Telemetry) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  disconnect(): void {
    this.ws?.close();
  }
}