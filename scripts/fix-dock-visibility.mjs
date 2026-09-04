import fs from "fs";

// Fix game-ai-hud-v21.js
const hudPath = "public/assets/game-ai-hud-v21.js";
let hud = fs.readFileSync(hudPath, "utf8");
hud = hud.replace(
  '[role="dialog"], [aria-modal="true"], #cm-app-dialog-backdrop, .cm-ai-modal-backdrop, .fixed.inset-0.z-50, .fixed.inset-0',
  '[role="dialog"], [aria-modal="true"], #cm-app-dialog-backdrop, .cm-ai-modal-backdrop, .fixed.inset-0.z-50'
);
fs.writeFileSync(hudPath, hud, "utf8");

// Fix room-layout-v20.css
const cssPath = "public/assets/room-layout-v20.css";
let css = fs.readFileSync(cssPath, "utf8");
css = css.replace(
  'body:has(.fixed.inset-0) .cm-home-android-dock,\n',
  ''
);
css = css.replace(
  'body:has(.fixed.inset-0.z-50) .cm-home-android-dock,\n',
  'body:has(.fixed.inset-0.z-50:not(.-z-10)) .cm-home-android-dock,\n'
);
fs.writeFileSync(cssPath, css, "utf8");

console.log("Fixed dock visibility logic");
