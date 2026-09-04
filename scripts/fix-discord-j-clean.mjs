import fs from "node:fs";
import path from "node:path";

const dirs = [
  "public/assets",
  "android/app/src/main/assets/public/assets",
  "ios/App/App/public/assets"
];

const cleanJ = 'async function J_(){try{const sp=new URLSearchParams(window.location.search),ses=sp.get("discord_session"),opts={method:"POST"};if(ses)opts.body=JSON.stringify({session:ses});const n=await Ds("/api/auth/discord/exchange",opts);return Nr(n.token),{user:n.user,linked:n.linked}}catch(n){return null}}';

dirs.forEach(assetsDir => {
  if (!fs.existsSync(assetsDir)) return;
  const files = fs.readdirSync(assetsDir);
  files.forEach(f => {
    if (f.startsWith("index-discord-v") && f.endsWith(".js")) {
      const filePath = path.join(assetsDir, f);
      let content = fs.readFileSync(filePath, "utf8");
      
      // Find async function J_() and its matching brace or replace based on known patterns
      const idx = content.indexOf("async function J_()");
      if (idx !== -1) {
        // Find matching closing brace
        let braceCount = 0;
        let endIdx = -1;
        let started = false;
        for (let i = idx; i < content.length; i++) {
          if (content[i] === "{") {
            braceCount++;
            started = true;
          } else if (content[i] === "}") {
            braceCount--;
          }
          if (started && braceCount === 0) {
            endIdx = i + 1;
            break;
          }
        }
        if (endIdx !== -1) {
          content = content.slice(0, idx) + cleanJ + content.slice(endIdx);
        } else {
          // fallback regex
          content = content.replace(/async function J_\(\)\s*\{[^}]+\}/g, cleanJ);
        }
      } else {
        content = content.replace(/async function J_\(\)\s*\{[^}]+\}/g, cleanJ);
      }
      
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`Cleaned J_ in ${filePath}`);
    }
  });
});
