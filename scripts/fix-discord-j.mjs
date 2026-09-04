import fs from "node:fs";
import path from "node:path";

const assetsDir = "public/assets";
const files = fs.readdirSync(assetsDir);

files.forEach(f => {
  if (f.startsWith("index-discord-v") && f.endsWith(".js")) {
    const filePath = path.join(assetsDir, f);
    let content = fs.readFileSync(filePath, "utf8");

    // Replace J_ implementation safely
    // Let's find async function J_
    const jRegex = /async function J_\(\)\s*\{[^}]+\}/g;
    const cleanJ = 'async function J_(){try{const sp=new URLSearchParams(window.location.search),ses=sp.get("discord_session"),opts={method:"POST"};if(ses)opts.body=JSON.stringify({session:ses});const n=await Ds("/api/auth/discord/exchange",opts);return Nr(n.token),{user:n.user,linked:n.linked}}catch(n){return null}}';

    if (jRegex.test(content)) {
      content = content.replace(jRegex, cleanJ);
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`Cleaned J_ in ${f}`);
    } else {
      console.log(`Could not find J_ regex in ${f}`);
    }
  }
});
