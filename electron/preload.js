const { contextBridge, ipcRenderer } = require("electron");

// Minimal bridge: lets the library UI open Electron's native folder dialog.
// The web app feature-detects window.wondervoice and falls back to the
// server-side dialog / in-page browser when running in a plain browser.
contextBridge.exposeInMainWorld("wondervoice", {
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  // Opens the pending update's download page in the user's real browser.
  // No URL is passed from the page — main holds the vetted manifest URL.
  openDownload: () => ipcRenderer.invoke("open-download"),
});
