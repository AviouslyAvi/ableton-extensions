/**
 * ArtRoll Preview Bridge Probe — spike step 1 (+2).
 *
 * Question: can the modal webview reach the extension host MID-MODAL?
 * The SDK's only documented webview→host method is `close_and_send` (closes
 * the dialog). Binary inspection of Live 12 Beta shows a generic
 * TWebMessageDispatcher with handlers registered by string name, and
 * `close_and_send` is the only extension-dialog method string present — so
 * the protocol route is almost certainly closed. This probe verifies that
 * empirically AND tests the network side-channels (fetch / image beacon /
 * sendBeacon / WebSocket to a localhost server owned by this host process),
 * which bypass the SDK protocol entirely.
 *
 * Step 2 is included: every /note hit is forwarded as an OSC datagram to
 * UDP 7474 for the M4L receiver (ArtRollPreview.maxpat).
 */
import {
  initialize,
  type ActivationContext,
} from "@ableton-extensions/sdk";
import * as http from "node:http";
import * as crypto from "node:crypto";
import * as dgram from "node:dgram";
import { URL } from "node:url";

import probeHtml from "./probe.html";

const HTTP_PORT = 7475; // webview -> host side-channel
const UDP_PORT = 7474; // host -> M4L audition device

// 1x1 transparent GIF for the image-beacon probe (an <img> needs real bytes
// for onload to fire).
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const log = (...args: unknown[]) => console.log("[preview-bridge]", ...args);

// ---- OSC encoding (minimal: one address + int32 args) -----------------------

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

// ---- WebSocket: minimal RFC6455 accept + text-frame read/write --------------

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const wsAcceptKey = (key: string): string =>
  crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64");

/** Encode a small (<126 byte) unmasked text frame. */
const wsTextFrame = (text: string): Buffer => {
  const payload = Buffer.from(text);
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
};

/** Decode small masked client text frames; returns decoded strings. */
const wsDecodeFrames = (data: Buffer): string[] => {
  const out: string[] = [];
  let i = 0;
  while (i + 6 <= data.length) {
    const len = data[i + 1]! & 0x7f;
    if (len > 125) break; // probe only handles small frames
    const mask = data.subarray(i + 2, i + 6);
    const payload = Buffer.from(data.subarray(i + 6, i + 6 + len));
    for (let j = 0; j < payload.length; j++) payload[j] = payload[j]! ^ mask[j % 4]!;
    if ((data[i]! & 0x0f) === 0x1) out.push(payload.toString());
    i += 6 + len;
  }
  return out;
};

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  const udp = dgram.createSocket("udp4");

  const sendNote = (pitch: number, vel: number, durMs: number, ks: number, ksHold: number) => {
    const msg = oscMessage("/artroll/note", [pitch, vel, durMs, ks, ksHold]);
    udp.send(msg, UDP_PORT, "127.0.0.1", (err) => {
      if (err) log("UDP send error:", err.message);
    });
    log(`OSC -> :${UDP_PORT} /artroll/note pitch=${pitch} vel=${vel} dur=${durMs}ms ks=${ks} ksHold=${ksHold}`);
  };

  // ---- HTTP side-channel server (fetch / img / sendBeacon) ------------------

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${HTTP_PORT}`);
    const ch = url.searchParams.get("ch") ?? "?";
    log(`HTTP hit MID-MODAL: ${req.method} ${url.pathname} channel=${ch}`);

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
    if (url.pathname === "/probe") {
      if (ch === "img") {
        res.writeHead(200, { ...cors, "Content-Type": "image/gif" });
        res.end(GIF);
      } else {
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, channel: ch, seenAt: Date.now() }));
      }
      return;
    }
    if (url.pathname === "/note") {
      sendNote(
        Number(url.searchParams.get("pitch") ?? 60),
        Number(url.searchParams.get("vel") ?? 100),
        Number(url.searchParams.get("dur") ?? 300),
        Number(url.searchParams.get("ks") ?? -1),
        Number(url.searchParams.get("ksHold") ?? 150),
      );
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404, cors);
    res.end();
  });

  // WebSocket upgrade: complete the handshake, echo every message.
  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    log("WS upgrade request MID-MODAL", key ? "(handshaking)" : "(no key?)");
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${wsAcceptKey(key)}\r\n\r\n`,
    );
    socket.write(wsTextFrame("host-hello"));
    socket.on("data", (data: Buffer) => {
      for (const text of wsDecodeFrames(data)) {
        log("WS message MID-MODAL:", text);
        // Note clicks can ride the socket too: "note p v dur ks ksHold"
        const m = text.match(/^note (\d+) (\d+) (\d+) (-?\d+) (\d+)$/);
        if (m) sendNote(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!);
        socket.write(wsTextFrame("echo:" + text));
      }
    });
    socket.on("error", (e) => log("WS socket error:", e.message));
  });

  server.on("error", (e) => log("HTTP server error:", (e as Error).message));
  server.listen(HTTP_PORT, "127.0.0.1", () =>
    log(`side-channel server listening on 127.0.0.1:${HTTP_PORT}`),
  );

  // ---- Probe dialog ----------------------------------------------------------

  const openProbe = async (): Promise<void> => {
    log("opening probe modal — watch this console for MID-MODAL lines");
    const raw = await context.ui.showModalDialog(
      `data:text/html,${encodeURIComponent(probeHtml)}`,
      760,
      560,
    );
    log("modal closed; webview-side log follows:");
    try {
      for (const line of JSON.parse(raw) as string[]) log("  webview:", line);
    } catch {
      log("  (unparseable result)", raw);
    }
  };

  context.commands.registerCommand("previewBridge.probe", () => void openProbe());
  context.ui.registerContextMenuAction(
    "MidiClip",
    "Preview Bridge Probe…",
    "previewBridge.probe",
  );
}
