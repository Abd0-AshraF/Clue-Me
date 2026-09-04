import fs from "node:fs";
import path from "node:path";

const assetsDir = "public/assets";
const files = fs.readdirSync(assetsDir);

files.forEach(f => {
  if (f.startsWith("index-discord-v") && f.endsWith(".js")) {
    const filePath = path.join(assetsDir, f);
    let content = fs.readFileSync(filePath, "utf8");

    // Let/'s find async function J_ and replace properly
    const idx = content.indexOf("async function J_()");
    if (idx !== -1) {
      // Find where J_ ends. Since minified code doesn't have neat braces usually or has matching braces, let's inspect or use a robust regex.
      // Actually let's find "async function J_(){" and find matching closing brace.
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
        const replacement = 'async function J_(){try{const sp=new URLSearchParams(window.location.search),ses=sp.get("discord_session"),opts={method:"POST"};if(ses)opts.body=JSON.stringify({session:ses});const n=await Ds("/api/auth/discord/exchange",opts);return Nr(n.token),{user:n.user,linked:n.linked}}catch(n){return null}}';
        content = content.slice(0, idx) + replacement + content.slice(endIdx);
        fs.writeFileSync(filePath, content, "utf8");
        console.log(`Successfully fixed J_ in ${f}`);
      } else {
        console.log(`Could not find matching brace for J_ in ${f}`);
      }
    } else {
      console.log(`Could not find J_ in ${f}`);
    }
  }
});
