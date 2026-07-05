import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { localModeUnavailable } from "@/lib/local-mode";

export const runtime = "nodejs";

/**
 * Open the operating system's native "choose folder" dialog and return the
 * selected path. Only possible because local mode runs on the user's own
 * machine — the dialog appears on their desktop, not in the browser.
 *
 * Browsers deliberately never reveal real filesystem paths (the File System
 * Access API returns opaque handles), so a native dialog is the only way to
 * "browse" with the real Finder/Explorer UI.
 */

const DIALOG_TIMEOUT_MS = 5 * 60 * 1000; // user may take a while

function run(cmd: string, args: string[]): Promise<{ out: string; canceled: boolean }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: DIALOG_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        // macOS: cancel exits non-zero with "User canceled. (-128)".
        // zenity: cancel exits 1 with empty output.
        if (stderr.includes("-128") || (!stdout.trim() && !stderr.trim())) {
          return resolve({ out: "", canceled: true });
        }
        return reject(new Error(stderr || err.message));
      }
      resolve({ out: stdout.trim(), canceled: !stdout.trim() });
    });
  });
}

function pickFolder(): Promise<{ out: string; canceled: boolean }> {
  switch (process.platform) {
    case "darwin":
      return run("osascript", [
        "-e",
        'tell application "System Events" to activate',
        "-e",
        'POSIX path of (choose folder with prompt "Choose your invoice folder")',
      ]);
    case "win32":
      return run("powershell", [
        "-NoProfile",
        "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; " +
          "$d = New-Object System.Windows.Forms.FolderBrowserDialog; " +
          "$d.Description = 'Choose your invoice folder'; " +
          "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }",
      ]);
    default:
      // Linux: zenity is the common option; fails cleanly if not installed.
      return run("zenity", [
        "--file-selection",
        "--directory",
        "--title=Choose your invoice folder",
      ]);
  }
}

export async function POST(req: Request) {
  const gate = localModeUnavailable();
  if (gate) return gate;
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }

  try {
    const { out, canceled } = await pickFolder();
    if (canceled) return NextResponse.json({ canceled: true });
    return NextResponse.json({ path: out.replace(/\/$/, "") });
  } catch (err) {
    console.error("native folder dialog failed", err);
    return NextResponse.json(
      { error: "Couldn't open the system folder dialog — use the browser below instead." },
      { status: 500 },
    );
  }
}
