const { execFileSync } = require("node:child_process");
const path = require("node:path");

// Ad-hoc sign the fully-assembled macOS bundle so its signature actually seals
// the whole app (including the bundled server). electron-builder skips signing
// (identity: null — there's no Apple Developer cert), which leaves only the
// linker's stub on the main binary → downloaded copies get flagged "damaged"
// by Gatekeeper. A real ad-hoc signature downgrades that to the normal
// "unidentified developer" prompt, which right-click → Open bypasses.
//
// Runs after the app dir is packed (with all resources in place) and before the
// dmg/zip are built, so the signed app is what ships.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], {
    stdio: "inherit",
  });
  console.log(`[afterPack] ad-hoc signed ${app}`);
};
