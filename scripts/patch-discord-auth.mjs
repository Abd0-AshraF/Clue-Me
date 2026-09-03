import fs from "node:fs";
import path from "node:path";

// 1. Patch index.js
let serverJs = fs.readFileSync("index.js", "utf8");

// Update callback redirect to include discord_session query param
const oldRedirect = 'c.redirect(302,`${l.origin}${l.returnTo}?auth=discord`)';
const newRedirect = 'c.redirect(302,`${l.origin}${l.returnTo}?auth=discord&discord_session=${w}`)';

if (serverJs.includes(oldRedirect)) {
  serverJs = serverJs.replace(oldRedirect, newRedirect);
  console.log("Successfully patched callback redirect in index.js");
} else {
  console.log("Warning: oldRedirect not found exactly in index.js");
}

// Update /api/auth/discord/exchange to accept session from body or query as fallback
const oldExchange = 't.post("/api/auth/discord/exchange",(s,c)=>{let u=jK(s.headers.cookie,Gy),l=u?n.get(u):void 0;if(l&&u&&n.delete(u),c.clearCookie(Gy,{path:DI}),!l){';
const newExchange = 't.post("/api/auth/discord/exchange",(s,c)=>{let u=jK(s.headers.cookie,Gy)||s.body?.session||s.query?.session;let l=u?n.get(u):void.0;if(l&&u)n.delete(u);c.clearCookie(Gy,{path:DI});if(!l){';

if (serverJs.includes(oldExchange)) {
  serverJs = serverJs.replace(oldExchange, newExchange);
  console.log("Successfully patched exchange route in index.js");
} else {
  // Try matching substring
  console.log("Searching alternative exchange match...");
  const altOldExchange = 't.post("/api/auth/discord/exchange"';
  let idx = serverJs.indexOf(altOldExchange);
  if (idx !== -1) {
    console.log("Found exchange route at index", idx);
  } else {
    console.log("Error: exchange route not found");
  }
}

fs.writeFileSync("index.js", serverJs, "utf8");

// 2. Patch public/assets/index-discord-v*.js files
const assetsDir = "public/assets";
const files = fs.readdirSync(assetsDir);
files.forEach(f => {
  if (f.startsWith("index-discord-v") && f.endsWith(".js")) {
    const filePath = path.join(assetsDir, f);
    let content = fs.readFileSync(filePath, "utf8");
    
    // Target J_ function
    const oldJ = 'async function J_(){try{const n=await Ds("/api/auth/discord/exchange",{method:"POST"});';
    const newJ = 'async function J_(){try{const sp=new URLSearchParams(window.location.search),ses=sp.get("discord_session");const n=await Ds("/api/auth/discord/exchange",{method:"POST",...(ses?{body:JSON.stringify({session:ses})}:{}});';
    
    if (content.includes(oldJ)) {
      content = content.replace(oldJ, newJ);
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`Successfully patched ${f}`);
    } else {
      // Try regex replacement for J_
      const jRegex = /async function J_\(\)\s*\{\s*try\s*\{\s*const\s+([a-zA-Z0-9_$]+)=await Ds\("\/api\/auth\/discord\/exchange",\s*\{method:"POST"\}\);/g;
      if (jRegex.test(content)) {
        content = content.replace(jRegex, 'async function J_(){try{const sp=new URLSearchParams(window.location.search),ses=sp.get("discord_session");const $1=await Ds("/api/auth/discord/exchange",{method:"POST",...(ses?{body:JSON.stringify({session:ses})}:{}});');
        fs.writeFileSync(filePath, content, "utf8");
        console.log(`Successfully patched ${f} via regex`);
      } else {
        console.log(`Could not patch J_ in ${f}`);
      }
    }
  }
});
