const WebSocket = require("ws");
const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");

const {
  nextTelemetry,
  setCommand
} = require("./telemetry-simulator");

const {
  isAuthEnabled,
  sign,
  verify,
  verifyHandshakeToken
} = require("./telemetry-auth");

const HOST = process.env.TELEMETRY_HOST || "127.0.0.1"; // loopback-only by default
const PORT = Number(process.env.TELEMETRY_PORT || 8787);

const TLS_CERT_PATH = process.env.TELEMETRY_TLS_CERT;
const TLS_KEY_PATH = process.env.TELEMETRY_TLS_KEY;

const MAX_MESSAGES_PER_SECOND = 30; // per-connection rate limit
const MAX_CONNECTIONS = 8;

function buildHttpServer() {
  if (TLS_CERT_PATH && TLS_KEY_PATH && fs.existsSync(TLS_CERT_PATH) && fs.existsSync(TLS_KEY_PATH)) {
    console.log("[telemetry-server] TLS enabled (wss://)");
    return https.createServer({
      cert: fs.readFileSync(TLS_CERT_PATH),
      key: fs.readFileSync(TLS_KEY_PATH)
    });
  }

  console.warn(
    "[telemetry-server] TLS_CERT/TLS_KEY not configured — running plain ws:// " +
    "(acceptable for loopback dev, NOT acceptable once this link leaves localhost)."
  );
  return http.createServer();
}

function startTelemetryServer() {
  const httpServer = buildHttpServer();
  const wss = new WebSocket.Server({ server: httpServer, maxPayload: 8 * 1024 });

  httpServer.listen(PORT, HOST, () => {
    const scheme = TLS_CERT_PATH && TLS_KEY_PATH ? "wss" : "ws";
    console.log(`Telemetry WebSocket listening on ${scheme}://${HOST}:${PORT}`);
    console.log(`[telemetry-server] Auth: ${isAuthEnabled() ? "ENABLED" : "DISABLED (dev mode)"}`);
  });

  wss.on("connection", (socket, request) => {

    if (wss.clients.size > MAX_CONNECTIONS) {
      socket.close(4003, "Too many connections");
      return;
    }

    const query = url.parse(request.url, true).query;
    const token = query.token;

    if (!verifyHandshakeToken(token)) {
      console.warn("[telemetry-server] Rejected connection: invalid/missing handshake token");
      socket.close(4001, "Unauthorized");
      return;
    }

    console.log("Dashboard connected (authenticated)");

    // --- per-connection rate limiting ---
    let messageCount = 0;
    const rateLimitWindow = setInterval(() => {
      messageCount = 0;
    }, 1000);

    function sendSigned(payloadObj) {
      const payloadString = JSON.stringify(payloadObj);
      const envelope = { payload: payloadObj, sig: sign(payloadString) };
      socket.send(JSON.stringify(envelope));
    }

    sendSigned(nextTelemetry());

    socket.on("message", (message) => {
      messageCount += 1;
      if (messageCount > MAX_MESSAGES_PER_SECOND) {
        console.warn("[telemetry-server] Rate limit exceeded, dropping message");
        return;
      }

      try {
        const envelope = JSON.parse(message.toString());
        const payloadString = JSON.stringify(envelope.payload);

        if (!verify(payloadString, envelope.sig)) {
          console.warn("[telemetry-server] Rejected command: bad/missing signature");
          return;
        }

        setCommand(envelope.payload);
      } catch (error) {
        console.error("Invalid command:", error.message);
      }
    });

    const timer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        sendSigned(nextTelemetry());
      }
    }, 200);

    socket.on("close", () => {
      clearInterval(timer);
      clearInterval(rateLimitWindow);
      console.log("Dashboard disconnected");
    });

    socket.on("error", (err) => {
      console.error("[telemetry-server] Socket error:", err.message);
    });
  });
}

module.exports = { startTelemetryServer };