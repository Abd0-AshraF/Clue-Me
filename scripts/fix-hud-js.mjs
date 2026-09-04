import fs from "fs";
const hudPath = "public/assets/game-ai-hud-v21.js";
let hud = fs.readFileSync(hudPath, "utf8");

hud = hud.replace(
  /if \(isNativeAppEnvironment\(\)\) \{\s*if \(existingDock\) existingDock\.remove\(\);\s*return;\s*\}/g,
  ''
);

fs.writeFileSync(hudPath, hud, "utf8");
console.log("Removed isNativeAppEnvironment check from syncHomePageAndroidButtons");
