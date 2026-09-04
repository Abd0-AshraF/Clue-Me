import fs from "node:fs";
import path from "node:path";

const dirs = [
  "public/assets",
  "android/app/src/main/assets/public/assets",
  "ios/App/App/public/assets"
];

dirs.forEach(assetsDir => {
  if (!fs.existsSync(assetsDir)) return;
  const files = fs.readdirSync(assetsDir);
  files.forEach(f => {
    if (f.startsWith("index-discord-v") && f.endsWith(".js")) {
      const filePath = path.join(assetsDir, f);
      let content = fs.readFileSync(filePath, "utf8");
      
      // Fix any dangling ) after J_
      // J_ ends with `catch(n){return null}}`
      // If it ends with `catch(n){return null}})` or similar, clean it up
      content = content.replace(/async function J_\(\)\s*\{[^}]+\}\s*\)\s*/g, (match) => {
        // match might be async function J_(){...}})`
        return match.replace(/\)\s*$/, "");
      });

      // Also let's ensure valid function definition for J_
      const cleanJ = 'async function J_(){try{const sp=new URLSearchParams(window.location.search),ses=sp.get("discord_session"),opts={method:"POST"};if(ses)opts.body=JSON.stringify({session:ses});const n=await Ds("/api/auth/discord/exchange",opts);return Nr(n.token),{user:n.user,linked:n.linked}}catch(n){return null}}';
      
      // Replace whatever async function J_() {...} exists up to its closing brace
      const idx = content.indexOf("async function J_()");
      if (idx !== -1) {
        let braceCount = 0;
        let endIdx = -1;
        const openBrace = content.indexOf("{", idx);
        for (let i = openBrace; i < content.length; i++) {
          if (content[i] === "{") braceCount++;
          else if (content[i] === "}") braceCount--;
          if (braceCount === 0) {
            endIdx = i + 1;
            break;
          }
        }
        if (endIdx !== -1) {
          content = content.slice(0, idx) + cleanJ + content.slice(endIdx);
        }
      }

      // Clean up any trailing ) after J_ block if present
      content = content.replace(/async function J_\(\)\s*\{[\s\S]*?\}\}\)\s*/g, (m) => {
        return m.replace(/\)\s*$/, "");
      });

      fs.writeFileSync(filePath, content, "utf8");
      console.log(`Fixed ${filePath}`);
    }
  });
});
