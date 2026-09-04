const fs = require("fs");
const dirs = ["public/assets", "android/app/src/main/assets/public/assets", "ios/App/App/public/assets"];

dirs.forEach(d => {
  if(!fs.existsSync(d)) return;
  fs.readdirSync(d).forEach(f => {
    if(f.startsWith("index-discord-v") && f.endsWith(".js")) {
      const p = d + "/" + f;
      let c = fs.readFileSync(p, "utf8");
      const idx = c.indexOf("async function J_()");
      if (idx !== -1) {
        const nextAsync = c.indexOf("async function ", idx + 20);
        if (nextAsync !== -1) {
          const badPart = c.slice(idx, nextAsync);
          
          const DsMatch = badPart.match(/await ([a-zA-Z0-9_$]+)\("\/api\/auth/);
          const NrMatch = badPart.match(/return ([a-zA-Z0-9_$]+)\(n\.token\)/);
          const tcMatch = badPart.match(/instanceof ([a-zA-Z0-9_$]+)&&/);
          
          const Ds = DsMatch ? DsMatch[1] : "Ds";
          const Nr = NrMatch ? NrMatch[1] : "Nr";
          const tc = tcMatch ? tcMatch[1] : "tc";

          const cleanJ = `async function J_(){try{const sp=new URLSearchParams(window.location.search),ses=sp.get("discord_session"),opts={method:"POST"};if(ses)opts.body=JSON.stringify({session:ses});const n=await ${Ds}("/api/auth/discord/exchange",opts);return ${Nr}(n.token),{user:n.user,linked:n.linked}}catch(n){return n instanceof ${tc}&&n.code,null}}`;

          c = c.slice(0, idx) + cleanJ + c.slice(nextAsync);
          fs.writeFileSync(p, c, "utf8");
          console.log("Fixed", p);
        }
      }
    }
  });
});
