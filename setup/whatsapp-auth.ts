/**
<<<<<<< HEAD
 * Step: whatsapp-auth — standalone WhatsApp (Baileys) authentication.
 *
 * Forked from the channels-branch version so setup:auto's driver can render
 * the terminal UX itself (inside clack) instead of the step dumping a raw QR
 * to stdout. The browser method has been dropped — one less moving part and
 * it kept biting headless/SSH users.
 *
 * Methods:
 *   --method qr (default)          Emit each rotating QR as a status block
 *                                  with the raw QR string. Driver renders.
 *   --method pairing-code --phone  Request a pairing code. Emitted in a
 *                                  status block once the Baileys call returns.
 *
 * Block schema (parent parses these):
 *   WHATSAPP_AUTH_QR             { QR: "<raw>" }              — repeats
 *   WHATSAPP_AUTH_PAIRING_CODE   { CODE: "XXXX-XXXX" }        — one-shot
 *   WHATSAPP_AUTH                { STATUS: success }          — terminal
 *                                { STATUS: skipped, AUTH_DIR, REASON }
 *                                { STATUS: failed, ERROR: <reason> }
 *
 * STATUS values are kept in the runner's vocabulary (success/skipped/failed)
 * so `spawnStep` recognises them and sets `ok` correctly; WhatsApp-specific
 * UI text (e.g. "WhatsApp linked") lives in the driver's block handler.
 *
 * On success, credentials land in store/auth/ and the process exits 0.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
// Named import (not default) — pino's d.ts under NodeNext resolves the
// default export to `typeof pino` (namespace), which isn't callable. The
// named `pino` export resolves to the callable function.
import { pino } from 'pino';

import {
  makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { emitStatus } from './status.js';

const AUTH_DIR = path.join(process.cwd(), 'store', 'auth');
const PAIRING_CODE_FILE = path.join(process.cwd(), 'store', 'pairing-code.txt');
const baileysLogger = pino({ level: 'silent' });

// Baileys v6 bug: getPlatformId sends charCode (49) instead of enum value (1).
// Fixed in Baileys 7.x but not backported. Without this patch pairing codes
// fail with "couldn't link device" because WhatsApp receives an invalid
// platform id. createRequire because proto is not a named ESM export.
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { proto } = _require('@whiskeysockets/baileys') as { proto: any };
try {
  const _generics = _require(
    '@whiskeysockets/baileys/lib/Utils/generics',
  ) as Record<string, unknown>;
  _generics.getPlatformId = (browser: string): string => {
    const platformType =
      proto.DeviceProps.PlatformType[
        browser.toUpperCase() as keyof typeof proto.DeviceProps.PlatformType
      ];
    return platformType ? platformType.toString() : '1';
  };
} catch {
  // If CJS require fails, QR auth still works; only pairing code may be affected.
}

type AuthMethod = 'qr' | 'pairing-code';

/** Extract the bare phone digits from a WhatsApp JID like `14155551234:12@s.whatsapp.net`. */
function phoneFromId(id?: string | null): string {
  if (!id) return '';
  return id.split(':')[0].split('@')[0];
}

/** Read the linked number from saved credentials (the skipped / already-authed path). */
function readAuthedPhoneFromFile(): string {
  try {
    const raw = fs.readFileSync(path.join(AUTH_DIR, 'creds.json'), 'utf-8');
    const creds = JSON.parse(raw) as { me?: { id?: string } };
    return phoneFromId(creds.me?.id);
=======
 * Step: whatsapp-auth — WhatsApp interactive auth (QR code / pairing code).
 */
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { logger } from '../src/logger.js';
import { openBrowser, isHeadless } from './platform.js';
import { emitStatus } from './status.js';

const QR_AUTH_TEMPLATE = `<!DOCTYPE html>
<html><head><title>NanoClaw - WhatsApp Auth</title>
<meta http-equiv="refresh" content="3">
<style>
  body { font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
  h2 { margin: 0 0 8px; }
  .timer { font-size: 18px; color: #666; margin: 12px 0; }
  .timer.urgent { color: #e74c3c; font-weight: bold; }
  .instructions { color: #666; font-size: 14px; margin-top: 16px; }
  svg { width: 280px; height: 280px; }
</style></head><body>
<div class="card">
  <h2>Scan with WhatsApp</h2>
  <div class="timer" id="timer">Expires in <span id="countdown">60</span>s</div>
  <div id="qr">{{QR_SVG}}</div>
  <div class="instructions">Settings \\u2192 Linked Devices \\u2192 Link a Device</div>
</div>
<script>
  var startKey = 'nanoclaw_qr_start';
  var start = localStorage.getItem(startKey);
  if (!start) { start = Date.now().toString(); localStorage.setItem(startKey, start); }
  var elapsed = Math.floor((Date.now() - parseInt(start)) / 1000);
  var remaining = Math.max(0, 60 - elapsed);
  var countdown = document.getElementById('countdown');
  var timer = document.getElementById('timer');
  countdown.textContent = remaining;
  if (remaining <= 10) timer.classList.add('urgent');
  if (remaining <= 0) {
    timer.textContent = 'QR code expired \\u2014 a new one will appear shortly';
    timer.classList.add('urgent');
    localStorage.removeItem(startKey);
  }
</script></body></html>`;

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>NanoClaw - Connected!</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
  h2 { color: #27ae60; margin: 0 0 8px; }
  p { color: #666; }
  .check { font-size: 64px; margin-bottom: 16px; }
</style></head><body>
<div class="card">
  <div class="check">&#10003;</div>
  <h2>Connected to WhatsApp</h2>
  <p>You can close this tab.</p>
</div>
<script>localStorage.removeItem('nanoclaw_qr_start');</script>
</body></html>`;

function parseArgs(args: string[]): { method: string; phone: string } {
  let method = '';
  let phone = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--method' && args[i + 1]) {
      method = args[i + 1];
      i++;
    }
    if (args[i] === '--phone' && args[i + 1]) {
      phone = args[i + 1];
      i++;
    }
  }
  return { method, phone };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
>>>>>>> 8698fc88 (skill/whatsapp: WhatsApp channel integration)
  } catch {
    return '';
  }
}

<<<<<<< HEAD
/**
 * Render a raw QR payload to terminal block-art lines (small mode keeps it short
 * on 24-row terminals) plus a one-line caption. Returned as plain lines the
 * caller console.logs, so a streaming parent (hostExecStream) tees the live QR
 * straight to the operator's terminal — no parent-side renderQr / in-place redraw.
 */
async function renderQrLines(qr: string): Promise<string[]> {
  try {
    const QRCode = await import('qrcode');
    const art = await QRCode.toString(qr, { type: 'terminal', small: true });
    return [
      ...art.trimEnd().split('\n'),
      '',
      '   Open WhatsApp -> Settings -> Linked Devices -> Link a Device, then scan.',
    ];
  } catch {
    return ['QR code (raw): ' + qr];
  }
}

/** Print the pairing code as a spaced terminal card on plain stdout (teed live). */
function printPairingCard(code: string): void {
  const spaced = code.split('').join('  ');
  console.log(
    [
      '',
      `   ${spaced}`,
      '',
      '   Open WhatsApp -> Settings -> Linked Devices -> Link a Device',
      '   -> "Link with phone number instead" -> enter this code.',
      '   It expires in ~60 seconds.',
      '',
    ].join('\n'),
  );
}

function parseArgs(args: string[]): { method: AuthMethod; phone?: string } {
  let method: AuthMethod = 'qr';
  let phone: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--method': {
        const raw = args[++i];
        if (raw === 'qr' || raw === 'pairing-code') {
          method = raw;
        } else {
          console.error(`Unknown --method: ${raw} (expected 'qr' or 'pairing-code')`);
          process.exit(1);
        }
        break;
      }
      case '--phone':
        phone = args[++i];
        break;
    }
  }

  if (method === 'pairing-code' && !phone) {
    console.error('--phone is required for pairing-code method');
    process.exit(1);
  }

  return { method, phone };
}

export async function run(args: string[]): Promise<void> {
  const { method, phone } = parseArgs(args);

  if (fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
    emitStatus('WHATSAPP_AUTH', {
      STATUS: 'skipped',
      REASON: 'already-authenticated',
      AUTH_DIR,
      PHONE: readAuthedPhoneFromFile(),
=======
function getPhoneNumber(projectRoot: string): string {
  try {
    const creds = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, 'store', 'auth', 'creds.json'),
        'utf-8',
      ),
    );
    if (creds.me?.id) {
      return creds.me.id.split(':')[0].split('@')[0];
    }
  } catch {
    // Not available yet
  }
  return '';
}

function emitAuthStatus(
  method: string,
  authStatus: string,
  status: string,
  extra: Record<string, string> = {},
): void {
  const fields: Record<string, string> = {
    AUTH_METHOD: method,
    AUTH_STATUS: authStatus,
    ...extra,
    STATUS: status,
    LOG: 'logs/setup.log',
  };
  emitStatus('AUTH_WHATSAPP', fields);
}

export async function run(args: string[]): Promise<void> {
  const projectRoot = process.cwd();

  const { method, phone } = parseArgs(args);
  const statusFile = path.join(projectRoot, 'store', 'auth-status.txt');
  const qrFile = path.join(projectRoot, 'store', 'qr-data.txt');

  if (!method) {
    emitAuthStatus('unknown', 'failed', 'failed', {
      ERROR: 'missing_method_flag',
    });
    process.exit(4);
  }

  // qr-terminal is a manual flow
  if (method === 'qr-terminal') {
    emitAuthStatus('qr-terminal', 'manual', 'manual', {
      PROJECT_PATH: projectRoot,
>>>>>>> 8698fc88 (skill/whatsapp: WhatsApp channel integration)
    });
    return;
  }

<<<<<<< HEAD
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      emitStatus('WHATSAPP_AUTH', { STATUS: 'failed', ERROR: 'timeout' });
      process.exit(1);
    }, 120_000);

    let succeeded = false;
    function succeed(phone?: string): void {
      if (succeeded) return;
      succeeded = true;
      clearTimeout(timeout);
      try {
        if (fs.existsSync(PAIRING_CODE_FILE)) fs.unlinkSync(PAIRING_CODE_FILE);
      } catch {
        // ignore — the pairing code file is best-effort cleanup
      }
      // Surface the linked number in the terminal block so the SKILL.md's
      // `nc:run effect:step capture:bot_phone=PHONE` binds it straight from the
      // block, instead of the caller reading it back out of store/auth/creds.json.
      emitStatus('WHATSAPP_AUTH', {
        STATUS: 'success',
        PHONE: phone || readAuthedPhoneFromFile(),
      });
      resolve();
      // Give a moment for creds to flush before exiting.
      setTimeout(() => process.exit(0), 1000);
    }

    async function connectSocket(isReconnect = false): Promise<void> {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestWaWebVersion({}).catch(() => ({
        version: undefined,
      }));

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        printQRInTerminal: false,
        logger: baileysLogger,
        browser: Browsers.macOS('Chrome'),
      });

      // Request pairing code only on first connect (not reconnect after 515).
      if (
        !isReconnect &&
        method === 'pairing-code' &&
        phone &&
        !state.creds.registered
      ) {
        setTimeout(async () => {
          try {
            const code = await sock.requestPairingCode(phone);
            fs.writeFileSync(PAIRING_CODE_FILE, code, 'utf-8');
            // Render the code as a plain-stdout card so a streaming parent tees
            // it live to the operator; keep the block for block-parsing callers.
            emitStatus('WHATSAPP_AUTH_PAIRING_CODE', { CODE: code });
            printPairingCard(code);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            emitStatus('WHATSAPP_AUTH', { STATUS: 'failed', ERROR: message });
            process.exit(1);
          }
        }, 3000);
      }

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR method: render each rotation as plain stdout lines so a streaming
        // parent (hostExecStream) tees the live QR straight to the operator's
        // terminal. The raw-QR status block is kept for any block-parsing caller.
        if (qr && method === 'qr') {
          emitStatus('WHATSAPP_AUTH_QR', { QR: qr });
          void renderQrLines(qr).then((lines) => {
            console.log('\n' + lines.join('\n'));
          });
        }

        if (connection === 'open') {
          succeed(phoneFromId(sock.user?.id ?? state.creds.me?.id));
          sock.end(undefined);
        }

        if (connection === 'close') {
          const reason = (
            lastDisconnect?.error as { output?: { statusCode?: number } }
          )?.output?.statusCode;
          if (reason === DisconnectReason.loggedOut) {
            clearTimeout(timeout);
            emitStatus('WHATSAPP_AUTH', {
              STATUS: 'failed',
              ERROR: 'logged_out',
            });
            process.exit(1);
          } else if (reason === DisconnectReason.timedOut) {
            clearTimeout(timeout);
            emitStatus('WHATSAPP_AUTH', {
              STATUS: 'failed',
              ERROR: 'qr_timeout',
            });
            process.exit(1);
          } else if (reason === 515) {
            // 515 = stream error after pairing succeeds but before registration
            // completes. Reconnect to finish the handshake.
            connectSocket(true);
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);
    }

    connectSocket();
  });
=======
  if (method === 'pairing-code' && !phone) {
    emitAuthStatus('pairing-code', 'failed', 'failed', {
      ERROR: 'missing_phone_number',
    });
    process.exit(4);
  }

  if (!['qr-browser', 'pairing-code'].includes(method)) {
    emitAuthStatus(method, 'failed', 'failed', { ERROR: 'unknown_method' });
    process.exit(4);
  }

  // Clean stale state
  logger.info({ method }, 'Starting channel authentication');
  try {
    fs.rmSync(path.join(projectRoot, 'store', 'auth'), {
      recursive: true,
      force: true,
    });
  } catch {
    /* ok */
  }
  try {
    fs.unlinkSync(qrFile);
  } catch {
    /* ok */
  }
  try {
    fs.unlinkSync(statusFile);
  } catch {
    /* ok */
  }

  // Start auth process in background
  const authArgs =
    method === 'pairing-code'
      ? ['src/whatsapp-auth.ts', '--pairing-code', '--phone', phone]
      : ['src/whatsapp-auth.ts'];

  const authProc = spawn('npx', ['tsx', ...authArgs], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  const logFile = path.join(projectRoot, 'logs', 'setup.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  authProc.stdout?.pipe(logStream);
  authProc.stderr?.pipe(logStream);

  // Cleanup on exit
  const cleanup = () => {
    try {
      authProc.kill();
    } catch {
      /* ok */
    }
  };
  process.on('exit', cleanup);

  try {
    if (method === 'qr-browser') {
      await handleQrBrowser(projectRoot, statusFile, qrFile);
    } else {
      await handlePairingCode(projectRoot, statusFile, phone);
    }
  } finally {
    cleanup();
    process.removeListener('exit', cleanup);
  }
}

async function handleQrBrowser(
  projectRoot: string,
  statusFile: string,
  qrFile: string,
): Promise<void> {
  // Poll for QR data (15s)
  let qrReady = false;
  for (let i = 0; i < 15; i++) {
    const statusContent = readFileSafe(statusFile);
    if (statusContent === 'already_authenticated') {
      emitAuthStatus('qr-browser', 'already_authenticated', 'success');
      return;
    }
    if (fs.existsSync(qrFile)) {
      qrReady = true;
      break;
    }
    await sleep(1000);
  }

  if (!qrReady) {
    emitAuthStatus('qr-browser', 'failed', 'failed', { ERROR: 'qr_timeout' });
    process.exit(3);
  }

  // Generate QR SVG and HTML
  const qrData = fs.readFileSync(qrFile, 'utf-8');
  try {
    const svg = execSync(
      `node -e "const QR=require('qrcode');const data='${qrData}';QR.toString(data,{type:'svg'},(e,s)=>{if(e)process.exit(1);process.stdout.write(s)})"`,
      { cwd: projectRoot, encoding: 'utf-8' },
    );
    const html = QR_AUTH_TEMPLATE.replace('{{QR_SVG}}', svg);
    const htmlPath = path.join(projectRoot, 'store', 'qr-auth.html');
    fs.writeFileSync(htmlPath, html);

    // Open in browser (cross-platform)
    if (!isHeadless()) {
      const opened = openBrowser(htmlPath);
      if (!opened) {
        logger.warn(
          'Could not open browser — display QR in terminal as fallback',
        );
      }
    } else {
      logger.info(
        'Headless environment — QR HTML saved but browser not opened',
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to generate QR HTML');
  }

  // Poll for completion (120s)
  await pollAuthCompletion('qr-browser', statusFile, projectRoot);
}

async function handlePairingCode(
  projectRoot: string,
  statusFile: string,
  phone: string,
): Promise<void> {
  // Poll for pairing code (15s)
  let pairingCode = '';
  for (let i = 0; i < 15; i++) {
    const statusContent = readFileSafe(statusFile);
    if (statusContent === 'already_authenticated') {
      emitAuthStatus('pairing-code', 'already_authenticated', 'success');
      return;
    }
    if (statusContent.startsWith('pairing_code:')) {
      pairingCode = statusContent.replace('pairing_code:', '');
      break;
    }
    if (statusContent.startsWith('failed:')) {
      emitAuthStatus('pairing-code', 'failed', 'failed', {
        ERROR: statusContent.replace('failed:', ''),
      });
      process.exit(1);
    }
    await sleep(1000);
  }

  if (!pairingCode) {
    emitAuthStatus('pairing-code', 'failed', 'failed', {
      ERROR: 'pairing_code_timeout',
    });
    process.exit(3);
  }

  // Write to file immediately so callers can read it without waiting for stdout
  try {
    fs.writeFileSync(
      path.join(projectRoot, 'store', 'pairing-code.txt'),
      pairingCode,
    );
  } catch {
    /* non-fatal */
  }

  // Emit pairing code immediately so the caller can display it to the user
  emitAuthStatus('pairing-code', 'pairing_code_ready', 'waiting', {
    PAIRING_CODE: pairingCode,
  });

  // Poll for completion (120s)
  await pollAuthCompletion(
    'pairing-code',
    statusFile,
    projectRoot,
    pairingCode,
  );
}

async function pollAuthCompletion(
  method: string,
  statusFile: string,
  projectRoot: string,
  pairingCode?: string,
): Promise<void> {
  const extra: Record<string, string> = {};
  if (pairingCode) extra.PAIRING_CODE = pairingCode;

  for (let i = 0; i < 60; i++) {
    const content = readFileSafe(statusFile);

    if (content === 'authenticated' || content === 'already_authenticated') {
      // Write success page if qr-auth.html exists
      const htmlPath = path.join(projectRoot, 'store', 'qr-auth.html');
      if (fs.existsSync(htmlPath)) {
        fs.writeFileSync(htmlPath, SUCCESS_HTML);
      }
      const phoneNumber = getPhoneNumber(projectRoot);
      if (phoneNumber) extra.PHONE_NUMBER = phoneNumber;
      emitAuthStatus(method, content, 'success', extra);
      return;
    }

    if (content.startsWith('failed:')) {
      const error = content.replace('failed:', '');
      emitAuthStatus(method, 'failed', 'failed', { ERROR: error, ...extra });
      process.exit(1);
    }

    await sleep(2000);
  }

  emitAuthStatus(method, 'failed', 'failed', { ERROR: 'timeout', ...extra });
  process.exit(3);
>>>>>>> 8698fc88 (skill/whatsapp: WhatsApp channel integration)
}
