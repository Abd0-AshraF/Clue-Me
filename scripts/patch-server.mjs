import fs from "node:fs";

let js = fs.readFileSync("index.js", "utf8");

let target = 't.get("/api/auth/discord/config",(s,c)=>{let u=process.env.DISCORD_SERVER_INVITE_URL?.trim()||"https://discord.gg/clueme";c.json({enabled:a,clientId:a?r.clientId:null,serverInviteUrl:u})})';

let addition = ',t.get("/api/canonical-url",(s,c)=>{let roomId=s.query.room||s.query.roomId;if(!roomId){c.status(400).json({error:"Missing room parameter"});return;}let base=process.env.PUBLIC_URL?.trim().replace(/\\/+$/,"")||"https://clue-me.ai.studio";if(s&&s.headers&&s.headers.origin){let orig=s.headers.origin;if(orig&&/^https?:\\/\\/[^\\/]+$/i.test(orig)&&!orig.includes("localhost")){base=orig;}}c.json({canonicalUrl:`${base}/room/${roomId}`,roomId});}),t.get("/api/auth/discord/diagnostic",(s,c)=>{let configured=!!(r?.clientId&&r?.clientSecret);let requestOrigin=Ja(s);let computedRedirectUri=r?.redirectUri??`${requestOrigin}/api/auth/discord/callback`;let mismatch=r?.redirectUri&&!r.redirectUri.startsWith(requestOrigin);console.log(`[Discord Diagnostic] requestOrigin=${requestOrigin}, configuredRedirect=${r?.redirectUri}, computedRedirect=${computedRedirectUri}, mismatch=${mismatch}`);c.json({status:configured?(mismatch?"mismatch_warning":"ok"):"disabled",configured,clientIdPresent:!!r?.clientId,clientSecretPresent:!!r?.clientSecret,requestOrigin,configuredRedirectUri:r?.redirectUri||null,computedRedirectUri,mismatch,handshakeStatus:configured?"ready":"not_configured",timestamp:Date.now()});})';

if (js.includes(target)) {
  js = js.replace(target, target + addition);
  fs.writeFileSync("index.js", js, "utf8");
  console.log("Successfully patched index.js with canonical URL and Discord diagnostic endpoint!");
} else {
  console.log("Error: Target not found in index.js");
}
