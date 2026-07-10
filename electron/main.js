const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

// Where the app checks for a newer version on launch. Point this at a JSON
// file you control (a GitHub Release asset is simplest — it lives next to the
// .dmg/.exe you publish). Shape:
//   { "version": "1.1.0",
//     "url": "https://github.com/<you>/<repo>/releases/latest",
//     "notes": "What changed (optional)" }
// The app never downloads or installs anything itself — it only nudges the
// user and opens `url` in their browser, so no code-signing is required.
const UPDATE_MANIFEST_URL =
  "https://github.com/Akila-Kavisinghe/MaInvoice-releases/releases/latest/download/latest.json";

// Set once a newer version is found; consumed by the "open-download" handler.
let pendingUpdate = null;

/**
 * WONDERvoice desktop shell.
 *
 * A thin wrapper around the Next.js app in local mode: boot the bundled
 * standalone server on a free loopback port, open a window at /library.
 * Everything else (folder picking, syncing, uploads) is the web app itself.
 *
 * Dev mode: `pnpm run app:dev` — points the window at http://127.0.0.1:3999
 * and auto-starts `pnpm local` from the repo root if nothing is listening
 * there yet, so one command is enough.
 */

const DEV = process.env.ELECTRON_DEV === "1";

let serverProcess = null;
let mainWindow = null;

// One instance is enough — a second launch focuses the existing window.
// Dev mode skips the lock: a stale window silently swallowing new launches
// is far more confusing than two dev windows.
if (!DEV && !app.requestSingleInstanceLock()) {
  console.log("WONDERvoice already running — focusing the existing window.");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(start).catch((err) => {
    console.error(err);
    app.quit();
  });
}

function page(title, body) {
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(
      `<!doctype html><html><head><title>WONDERvoice</title></head>
       <body style="margin:0;display:flex;align-items:center;justify-content:center;
         min-height:100vh;background:#0e1116;color:#e6e9ef;
         font-family:-apple-system,system-ui,sans-serif">
         <div style="text-align:center;max-width:26rem;padding:2rem">
           <h1 style="font-size:1.1rem;font-weight:600">${title}</h1>
           <p style="color:#98a1b3;font-size:.9rem;line-height:1.5">${body}</p>
         </div>
       </body></html>`,
    )
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function attachServerHandlers(proc, label) {
  proc.on("error", (err) => {
    console.error(`failed to start ${label}:`, err);
  });
  proc.on("exit", (code) => {
    console.error(`${label} exited with code ${code}`);
    serverProcess = null;
  });
}

/** Packaged mode: run the bundled standalone Next server. */
function startServer(port) {
  const serverDir = path.join(process.resourcesPath, "server");
  const env = {
    // Electron's binary doubles as Node when this is set.
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    LOCAL_MODE: "1",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    // Read-only app bundle → keep settings/data in the per-user data dir
    // (~/Library/Application Support/WONDERvoice on macOS).
    MAINVOICE_DATA_DIR: app.getPath("userData"),
    // Required by config getters; the band/password routes are never used
    // in local mode.
    SESSION_SECRET: "local-desktop-app",
    BAND_PASSWORD: "local-desktop-app",
    PATH: process.env.PATH ?? "",
  };
  serverProcess = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  attachServerHandlers(serverProcess, "local server");
}

/** Dev mode: spawn `pnpm local` from the repo root if :3999 isn't up. */
function startDevServer() {
  const root = path.join(__dirname, "..");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // a VS Code terminal exports this; it breaks child tooling
  serverProcess = spawn("pnpm", ["local"], {
    cwd: root,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  attachServerHandlers(serverProcess, "pnpm local");
}

function isUp(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => req.destroy());
  });
}

async function waitForServer(url, attempts) {
  for (let i = 0; i < attempts; i++) {
    if (await isUp(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Local server didn't start");
}

// Native folder picker for the library UI (no macOS automation permissions
// needed, unlike the osascript fallback the plain-browser flow uses).
ipcMain.handle("pick-folder", async () => {
  console.log("[pick-folder] invoked — opening native dialog");
  try {
    // Deliberately parentless: a standalone dialog window that macOS brings
    // to the front, rather than a sheet attached to mainWindow (sheets can
    // render off-screen/invisibly in some window states).
    app.focus({ steal: true });
    const result = await dialog.showOpenDialog({
      title: "Choose your invoice folder",
      buttonLabel: "Use this folder",
      properties: ["openDirectory", "createDirectory"],
    });
    console.log("[pick-folder] result:", JSON.stringify(result));
    return result.canceled ? null : result.filePaths[0];
  } catch (err) {
    console.error("[pick-folder] failed:", err);
    throw err;
  }
});

// The update banner's Download button lands here. Opens the release page
// (from our own manifest, not a page-supplied URL) in the real browser.
ipcMain.handle("open-download", () => {
  if (pendingUpdate?.url) shell.openExternal(pendingUpdate.url);
});

// --- Update check (notify-only, no auto-install) --------------------------

// Fetch JSON over https, following up to 3 redirects (GitHub release-asset
// URLs redirect to a storage host). Resolves null on any failure — a missing
// or unreachable manifest must never break app launch.
function fetchJson(url, redirectsLeft = 3) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "WONDERvoice" } }, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(fetchJson(new URL(headers.location, url).toString(), redirectsLeft - 1));
        return;
      }
      if (statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => req.destroy());
  });
}

// True if version `a` is strictly newer than `b` ("1.2.0" > "1.1.9").
// Non-numeric or missing parts are treated as 0.
function isNewer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

// Runs in the renderer (serialized via .toString()). Draws a dismissible
// top banner; the Download button asks main to open the release page.
function injectUpdateBanner(info) {
  const existing = document.getElementById("wv-update-banner");
  if (existing) existing.remove();
  const bar = document.createElement("div");
  bar.id = "wv-update-banner";
  bar.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;" +
    "align-items:center;gap:.75rem;padding:.6rem 1rem;" +
    "background:#1b2330;color:#e6e9ef;border-bottom:1px solid #2b3648;" +
    "font:500 13px/1.3 -apple-system,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)";
  const msg = document.createElement("span");
  msg.style.cssText = "flex:1;min-width:0";
  msg.textContent =
    "WONDERvoice " + info.version + " is available." + (info.notes ? " " + info.notes : "");
  const dl = document.createElement("button");
  dl.textContent = "Download";
  dl.style.cssText =
    "background:#3b82f6;color:#fff;border:0;border-radius:6px;padding:.35rem .8rem;" +
    "font:600 13px -apple-system,system-ui,sans-serif;cursor:pointer";
  dl.onclick = () => {
    if (window.wondervoice && window.wondervoice.openDownload) window.wondervoice.openDownload();
    dl.textContent = "Opening…";
  };
  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText =
    "background:transparent;color:#98a1b3;border:0;font-size:15px;cursor:pointer;padding:.2rem .4rem";
  close.onclick = () => bar.remove();
  bar.append(msg, dl, close);
  document.body.appendChild(bar);
}

async function checkForUpdates() {
  if (DEV) return; // dev runs from source; nothing to update
  const manifest = await fetchJson(UPDATE_MANIFEST_URL);
  if (!manifest || !manifest.version || !manifest.url) return;
  if (!isNewer(manifest.version, app.getVersion())) return;
  pendingUpdate = { url: manifest.url };
  if (!mainWindow) return;
  const payload = JSON.stringify({ version: manifest.version, notes: manifest.notes || "" });
  mainWindow.webContents
    .executeJavaScript(`(${injectUpdateBanner.toString()})(${payload});`)
    .catch((err) => console.error("[update] failed to show banner:", err));
}

async function start() {
  // Window first, so launching always shows something.
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 720,
    minHeight: 500,
    title: "WONDERvoice",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(page("Starting WONDERvoice…", "Getting the invoice library ready."));

  let base;
  if (DEV) {
    base = "http://127.0.0.1:3999";
    if (!(await isUp(`${base}/library`))) {
      console.log("dev server not running — starting `pnpm local`…");
      startDevServer();
    }
  } else {
    const port = await freePort();
    startServer(port);
    base = `http://127.0.0.1:${port}`;
  }

  // Anything that isn't our local server (e.g. the deployed admin page)
  // belongs in the user's real browser, where their Google session lives.
  const isLocal = (url) => url.startsWith(base) || url.startsWith("data:");
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isLocal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  try {
    // Dev cold-starts (next dev compiling) can take a while — be patient.
    await waitForServer(`${base}/library`, DEV ? 240 : 120);
  } catch {
    if (mainWindow) {
      mainWindow.loadURL(
        page(
          "The local server didn't start",
          DEV
            ? "Check the terminal you launched from for errors (is pnpm installed and `pnpm install` run?), then relaunch."
            : "Something went wrong starting the app's built-in server. Try relaunching; if it persists, rebuild the app.",
        ),
      );
    }
    return;
  }

  if (mainWindow) await mainWindow.loadURL(`${base}/library`);

  // Non-blocking: check for a newer version and, if any, show the banner.
  checkForUpdates().catch((err) => console.error("[update] check failed:", err));
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.on("before-quit", () => {
  app.isQuitting = true;
  stopServer();
});

// Single-window utility app: closing the window quits, macOS included.
app.on("window-all-closed", () => {
  app.quit();
});
