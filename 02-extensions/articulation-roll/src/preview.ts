/**
 * Preview + transport bridge — lets the modal webview trigger audible notes AND
 * drive Live's real transport while the modal is open.
 *
 * The SDK's webview protocol only carries `close_and_send`, and the SDK has no
 * transport API at all — but the modal is a real webview, so localhost
 * networking escapes it (probe-verified 2026-06-11: WebSocket, fetch, sendBeacon
 * and img beacons all reach the host mid-modal). The Max device on the track has
 * full Live Object Model access, so it becomes our transport remote.
 *
 * Ports:
 *   7475  webview  -> host   (WS/HTTP; notes + play/stop commands)
 *   7474  host     -> M4L    (OSC; /artroll/note, /artroll/play, /artroll/stop)
 *   7476  M4L      -> host   (OSC; /artroll/pos <beatMilli> <isPlaying>)
 *
 * Note flow:      roll.html -> :7475 -> :7474 -> ArtRollPreview -> instrument.
 * Transport flow: roll.html -> :7475 -> :7474 -> ArtRollPreview runs
 *   start_playing/stop_playing on live_set; ArtRollPreview polls song time and
 *   sends it back :7476 -> :7475 -> roll.html, which moves the editor playhead.
 * Failure mode at every hop is silence/no-sync, never an error to dismiss.
 */
import * as http from "node:http";
import * as crypto from "node:crypto";
import * as dgram from "node:dgram";
import { URL } from "node:url";
import type { Duplex } from "node:stream";

const HTTP_PORT = 7475; // webview -> host
const UDP_PORT = 7474; // host -> M4L
const POS_PORT = 7476; // M4L -> host (transport position feedback)

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

/** Parse an inbound OSC message, coercing int and float args to numbers. */
const oscParse = (buf: Buffer): { address: string; args: number[] } | null => {
  const nul = buf.indexOf(0);
  if (nul < 0) return null;
  const address = buf.toString("ascii", 0, nul);
  let p = (nul + 4) & ~3; // typetags start, padded to 4
  if (p >= buf.length || buf[p] !== 0x2c /* ',' */) return null;
  const tnul = buf.indexOf(0, p);
  if (tnul < 0) return null;
  const tags = buf.toString("ascii", p + 1, tnul);
  p = (tnul + 4) & ~3;
  const args: number[] = [];
  for (const t of tags) {
    if (p + 4 > buf.length) return null;
    if (t === "i") args.push(buf.readInt32BE(p));
    else if (t === "f") args.push(buf.readFloatBE(p));
    else return null;
    p += 4;
  }
  return { address, args };
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
 * Start the side-channel server + UDP sockets for one modal session.
 * Never throws: a port collision (stale host, second Live) just logs and
 * returns an inert bridge — the editor stays usable, silently.
 */
export const startPreviewBridge = (): PreviewBridge => {
  const udp = dgram.createSocket("udp4");

  const sendOsc = (address: string, ints: number[]) => {
    udp.send(oscMessage(address, ints), UDP_PORT, "127.0.0.1", (err) => {
      if (err) log("UDP send error:", err.message);
    });
  };

  const sendNote = (pitch: number, vel: number, durMs: number, ks: number, ksHold: number) =>
    sendOsc("/artroll/note", [pitch, vel, durMs, ks, ksHold]);

  const fromQuery = (url: URL) =>
    sendNote(
      Number(url.searchParams.get("pitch") ?? 60),
      Number(url.searchParams.get("vel") ?? 100),
      Number(url.searchParams.get("dur") ?? 250),
      Number(url.searchParams.get("ks") ?? -1),
      Number(url.searchParams.get("ksHold") ?? 120),
    );

  // Live WS sockets, so transport position frames can be pushed to the webview.
  const clients = new Set<Duplex>();

  const handleCommand = (text: string): boolean => {
    let m = text.match(/^note (\d+) (\d+) (\d+) (-?\d+) (\d+)$/);
    if (m) {
      sendNote(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!);
      return true;
    }
    m = text.match(/^play (-?\d+)$/);
    if (m) {
      sendOsc("/artroll/play", [+m[1]!]);
      return true;
    }
    if (text === "stop") {
      sendOsc("/artroll/stop", [1]);
      return true;
    }
    return false;
  };

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
    clients.add(socket);
    log("preview channel connected (WebSocket)");
    socket.on("data", (data: Buffer) => {
      for (const text of wsDecodeFrames(data)) handleCommand(text);
    });
    socket.on("close", () => clients.delete(socket));
    socket.on("error", (e) => {
      clients.delete(socket);
      log("WS socket error:", e.message);
    });
  });

  server.on("error", (e) => log("preview disabled:", (e as Error).message));
  server.listen(HTTP_PORT, "127.0.0.1", () => log(`listening on 127.0.0.1:${HTTP_PORT}`));

  // Reverse channel: M4L reports transport position; forward it to the webview.
  const pos = dgram.createSocket("udp4");
  pos.on("message", (msg) => {
    const parsed = oscParse(msg);
    if (!parsed || parsed.address !== "/artroll/pos" || parsed.args.length < 2) return;
    const beatMilli = Math.round(parsed.args[0]!);
    const isPlaying = parsed.args[1] ? 1 : 0;
    const frame = wsTextFrame(`pos ${beatMilli} ${isPlaying}`);
    for (const c of clients) {
      if (c.writable) c.write(frame);
    }
  });
  pos.on("error", (e) => log("transport feedback disabled:", e.message));
  pos.bind(POS_PORT, "127.0.0.1", () => log(`transport feedback on 127.0.0.1:${POS_PORT}`));

  return {
    close: () => {
      server.close();
      // drop any live WS sockets so close() doesn't linger
      server.closeAllConnections?.();
      clients.clear();
      udp.close();
      try {
        pos.close();
      } catch {
        /* already closed */
      }
    },
  };
};
