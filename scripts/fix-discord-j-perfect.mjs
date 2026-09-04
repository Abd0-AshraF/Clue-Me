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

      const idx = content.indexOf("async function J_()");
      if (idx !== -1) {
        // Find opening brace after index
        const openBraceIdx = content.indexOf("{", idx);
        if (openBraceIdx !== -1) {
          let braceCount = 0;
          let endIdx = -1;
          for (let i = openBraceIdx; i < content.length; i++) {
            if (content[i] === "{") {
              braceCount++;
            } else if (content[i] === "}") {
              braceCount--;
            }
            if (braceCount === 0) {
              endIdx = i + 1;
              break;
            }
          }
          if (endIdx !== -1) {
            content = content.slice(0, idx) + cleanJ + content.slice(endIdx);
            fs.writeFileSync(filePath, content, "utf8");
            console.log(`Successfully replaced J_ in ${filePath}`);
          } else {
            console.log(`Could not find matching brace for J_ in ${filePath}`);
          }
        }
      } else {
        console.log(`async function J_() not found in ${filePath}`);
      }
    }
  });
});
