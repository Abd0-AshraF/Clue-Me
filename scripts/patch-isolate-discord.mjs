import fs from "node:fs";

const filePath = "public/assets/index-discord-v37.js";
let content = fs.readFileSync(filePath, "utf8");

// 1. Remove the premature return in Ow useEffect
const targetOw = 'if(zi()&&localStorage.getItem("clue-me:discord_authed")==="1") return;';
if (content.includes(targetOw)) {
  content = content.replace(targetOw, '/* isolated */');
  console.log("✓ Removed premature boot return from Ow in index-discord-v37.js");
} else {
  console.log("! targetOw not found");
}

// 2. Prevent J_ from running inside Discord Activity
const targetJ = 'async function J_(forcedSes){try{';
const replacementJ = 'async function J_(forcedSes){try{if(typeof window!=="undefined"&&window.__IS_DISCORD_ACTIVITY__)return null;';
if (content.includes(targetJ)) {
  content = content.replace(targetJ, replacementJ);
  console.log("✓ Guarded J_ against executing in Discord Activity");
} else {
  console.log("! targetJ not found");
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully wrote updated index-discord-v37.js");
