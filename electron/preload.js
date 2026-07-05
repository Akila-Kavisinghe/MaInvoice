const { contextBridge, ipcRenderer } = require("electron");

// Minimal bridge: lets the library UI open Electron's native folder dialog.
// The web app feature-detects window.wondervoice and falls back to the
// server-side dialog / in-page browser when running in a plain browser.
contextBridge.exposeInMainWorld("wondervoice", {
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
});
