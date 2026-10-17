// Render entry for the telemetry WebSocket server. Leaves electron/telemetry-server.js unchanged.
process.env.TELEMETRY_HOST = process.env.TELEMETRY_HOST || "0.0.0.0";
process.env.TELEMETRY_PORT = process.env.PORT || process.env.TELEMETRY_PORT || "8787";

// Plain HTTP answer for Render's health check.
const http = require("http");
const realCreate = http.createServer;
http.createServer = function (...args) {
  const srv = realCreate.apply(this, args);
  srv.on("request", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("telemetry-server ok");
  });
  return srv;
};

// Render terminates TLS (clients use wss://), so the plain-ws log warning is expected.
require("../electron/telemetry-server").startTelemetryServer();