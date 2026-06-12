/**
 * Preview bridge — lets the modal webview trigger audible notes while open.
 *
 * The SDK's webview protocol only carries `close_and_send`, but the modal is a
 * real webview, so localhost networking escapes it (probe-verified 2026-06-11:
 * WebSocket, fetch, sendBeacon and img beacons all reach the host mid-modal —
 * see 03-experiments/artroll-preview-bridge/).
 *
 * Flow: roll.html → WS/HTTP on :7475 → this module → OSC datagram on UDP :7474
 * → ArtRollPreview.amxd (on the edited track, before the instrument) →
 * keyswitch-then-note through the real instrument. Failure mode at every hop
 * is silence, never an error the user has to dismiss.
 */
import * as http from "node:http";
import * as crypto from "node:crypto";
import * as dgram from "node:dgram";
import { URL } from "node:url";

const HTTP_PORT = 7475; // webview -> host
const UDP_PORT = 7474; // host -> M4L

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const log = (...args: unknown[]) => console.log("[articulation-roll/preview]", ...args);

// ---- OSC (one address, int32 args only) -------------------------------------

const oscPad = (b: Buffer): Buffer => {
  const rem = b.length % 4;
  return rem === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - rem)]);
};

const oscMessage = (address: string, ints: number[]): Buffer => {
  const addr = oscPad(Buffer.from(address + "\0"));
  const tags = oscPad(Buffer.from("," + "i".repeat(ints.length) + "\0"));
  const args = Buffer.alloc(4 * ints.length);
  ints.forEach((n, i) => args.writeInt32BE(Math.round(n), i * 4));
  return Buffer.concat([addr, tags, args]);
};

// ---- Minimal RFC6455 (small text frames are all the roll ever sends) --------

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const wsAcceptKey = (key: string): string =>
  crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64");

const wsTextFrame = (text: string): Buffer => {
  const payload = Buffer.from(text);
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
};

const wsDecodeFrames = (data: Buffer): string[] => {
  const out: string[] = [];
  let i = 0;
  while (i + 6 <= data.length) {
    const len = data[i + 1]! & 0x7f;
    if (len > 125) break;
    const mask = data.subarray(i + 2, i + 6);
    const payload = Buffer.from(data.subarray(i + 6, i + 6 + len));
    for (let j = 0; j < payload.length; j++) payload[j] = payload[j]! ^ mask[j % 4]!;
    if ((data[i]! & 0x0f) === 0x1) out.push(payload.toString());
    i += 6 + len;
  }
  return out;
};

// ---- Bridge ------------------------------------------------------------------

export type PreviewBridge = { close: () => void };

/**
 * Start the side-channel server + UDP sender for one modal session.
 * Never throws: a port collision (stale host, second Live) just logs and
 * returns an inert bridge — the editor stays usable, silently.
 */
export const startPreviewBridge = (): PreviewBridge => {
  const udp = dgram.createSocket("udp4");

  const sendNote = (pitch: number, vel: number, durMs: number, ks: number, ksHold: number) => {
    const msg = oscMessage("/artroll/note", [pitch, vel, durMs, ks, ksHold]);
    udp.send(msg, UDP_PORT, "127.0.0.1", (err) => {
      if (err) log("UDP send error:", err.message);
    });
  };

  const fromQuery = (url: URL) =>
    sendNote(
      Number(url.searchParams.get("pitch") ?? 60),
      Number(url.searchParams.get("vel") ?? 100),
      Number(url.searchParams.get("dur") ?? 250),
      Number(url.searchParams.get("ks") ?? -1),
      Number(url.searchParams.get("ksHold") ?? 120),
    );

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${HTTP_PORT}`);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Private-Network": "true",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (url.pathname === "/note") {
      fromQuery(url);
      if (url.searchParams.get("ch") === "img") {
        res.writeHead(200, { ...cors, "Content-Type": "image/gif" });
        res.end(GIF);
      } else {
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      }
      return;
    }
    res.writeHead(404, cors);
    res.end();
  });

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${wsAcceptKey(key)}\r\n\r\n`,
    );
    log("preview channel connected (WebSocket)");
    socket.on("data", (data: Buffer) => {
      for (const text of wsDecodeFrames(data)) {
        const m = text.match(/^note (\d+) (\d+) (\d+) (-?\d+) (\d+)$/);
        if (m) sendNote(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!);
      }
    });
    socket.on("error", (e) => log("WS socket error:", e.message));
  });

  server.on("error", (e) => log("preview disabled:", (e as Error).message));
  server.listen(HTTP_PORT, "127.0.0.1", () => log(`listening on 127.0.0.1:${HTTP_PORT}`));

  return {
    close: () => {
      server.close();
      // drop any live WS sockets so close() doesn't linger
      server.closeAllConnections?.();
      udp.close();
    },
  };
};
