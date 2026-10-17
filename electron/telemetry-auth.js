/**
 * Shared-secret HMAC authentication for the telemetry WebSocket link.
 *
 * Design goals for a hackathon-realistic "secure telemetry architecture":
 *  - No new npm dependency (uses Node's built-in crypto).
 *  - Works the same on the loopback dev link today and on a real
 *    ECU/CAN adapter link later.
 *  - Handshake token is time-boxed (60s buckets, tolerant of 1 bucket
 *    of clock skew) so a captured token can't be replayed indefinitely.
 *  - Every telemetry frame from the server and every command frame
 *    from the client is HMAC-signed, so tampering/injection on an
 *    unencrypted network segment is detectable even without TLS.
 *
 * The secret is resolved in this order:
 *   1. TELEMETRY_SHARED_SECRET environment variable
 *   2. electron/telemetry.secret.json  ({ "secret": "..." })  — gitignored
 *   3. none -> auth runs in DISABLED/dev mode with a loud console warning
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function loadSecret() {
  if (process.env.TELEMETRY_SHARED_SECRET) {
    return process.env.TELEMETRY_SHARED_SECRET;
  }

  const localSecretPath = path.join(__dirname, "telemetry.secret.json");

  try {
    if (fs.existsSync(localSecretPath)) {
      const parsed = JSON.parse(fs.readFileSync(localSecretPath, "utf-8"));
      if (parsed && parsed.secret) {
        return String(parsed.secret);
      }
    }
  } catch (err) {
    console.warn("[telemetry-auth] Could not read telemetry.secret.json:", err.message);
  }

  return "";
}

const SHARED_SECRET = loadSecret();

if (!SHARED_SECRET) {
  console.warn(
    "\n[telemetry-auth] TELEMETRY_SHARED_SECRET is not set.\n" +
    "  Telemetry link is running WITHOUT authentication (dev mode).\n" +
    "  Set TELEMETRY_SHARED_SECRET (env var) or create\n" +
    "  electron/telemetry.secret.json before connecting real engine hardware.\n"
  );
}

function isAuthEnabled() {
  return Boolean(SHARED_SECRET);
}

function timingSafeEqualHex(expectedHex, actualHex) {
  if (!actualHex) return false;
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(String(actualHex), "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** HMAC-sign an arbitrary payload string (used for per-message signatures). */
function sign(payloadString) {
  if (!SHARED_SECRET) return "";
  return crypto.createHmac("sha256", SHARED_SECRET).update(payloadString).digest("hex");
}

/** Verify a per-message signature. Always true if auth is disabled (dev mode). */
function verify(payloadString, signature) {
  if (!SHARED_SECRET) return true;
  return timingSafeEqualHex(sign(payloadString), signature);
}

/** Token used at WebSocket handshake time (?token=...), valid ~60-120s. */
function currentHandshakeToken() {
  if (!SHARED_SECRET) return "";
  const bucket = Math.floor(Date.now() / 60000);
  return crypto.createHmac("sha256", SHARED_SECRET).update(String(bucket)).digest("hex");
}

function verifyHandshakeToken(token) {
  if (!SHARED_SECRET) return true; // dev mode
  const now = Math.floor(Date.now() / 60000);
  for (const bucket of [now, now - 1]) {
    const expected = crypto.createHmac("sha256", SHARED_SECRET).update(String(bucket)).digest("hex");
    if (timingSafeEqualHex(expected, token)) return true;
  }
  return false;
}

module.exports = {
  isAuthEnabled,
  sign,
  verify,
  currentHandshakeToken,
  verifyHandshakeToken
};