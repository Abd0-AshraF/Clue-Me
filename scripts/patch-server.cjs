const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '../index.js');
let code = fs.readFileSync(serverPath, 'utf8');

console.log('Patching index.js (server)...');

// 1. Patch exchange code endpoint if not already patched
const targetEx = 't.post("/api/auth/discord/exchange",(s,c)=>{let u=jK(s.headers.cookie,Gy),l=u?n.get(u):void 0;';
const replaceEx = 't.post("/api/auth/discord/exchange",(s,c)=>{let u=s.body?.code||s.body?.exchangeCode||s.query?.code||jK(s.headers.cookie,Gy),l=u?n.get(u):void 0;';

if (code.includes(targetEx)) {
  code = code.replace(targetEx, replaceEx);
  console.log('- Exchange route patched successfully.');
} else if (code.includes('s.body?.code||s.body?.exchangeCode')) {
  console.log('- Exchange route already patched.');
} else {
  console.error('⚠️ Could not find exchange route target in index.js');
}

// 2. Patch oo (error helper) to handle deep links
const targetOo = 'function oo(t,e,r,i){let n=new URLSearchParams({auth:"discord",error:i});t.redirect(302,`${e}${r}?${n.toString()}`)}';
const replaceOo = 'function oo(t,e,r,i){let n=new URLSearchParams({auth:"discord",error:i});let target=r.includes("://")?`${r}?${n.toString()}`:`${e}${r}?${n.toString()}`;t.redirect(302,target)}';

if (code.includes(targetOo)) {
  code = code.replace(targetOo, replaceOo);
  console.log('- Error helper oo patched successfully.');
} else if (code.includes('r.includes("://")')) {
  console.log('- Error helper oo already patched.');
} else {
  console.error('⚠️ Could not find error helper oo target in index.js');
}

// 3. Patch callback redirect (success callback) to handle deep links
// Check for both the unpatched and patched callback redirects
const targetCbUnpatched = 'c.cookie(Gy,w,{httpOnly:!0,sameSite:"lax",secure:A,maxAge:NI,path:DI}),c.redirect(302,`${l.origin}${l.returnTo}?auth=discord`)';
const targetCbPatched = 'c.cookie(Gy,w,{httpOnly:!0,sameSite:"lax",secure:A,maxAge:NI,path:DI}),c.redirect(302,`${l.origin}${l.returnTo}?auth=discord&code=${w}`)';

const replaceCb = 'c.cookie(Gy,w,{httpOnly:!0,sameSite:"lax",secure:A,maxAge:NI,path:DI});let targetUrl=l.returnTo.includes("://")?`${l.returnTo}?auth=discord&code=${w}`:`${l.origin}${l.returnTo}?auth=discord&code=${w}`;c.redirect(302,targetUrl)';

if (code.includes(targetCbPatched)) {
  code = code.replace(targetCbPatched, replaceCb);
  console.log('- Callback redirect patched successfully (from previous patch).');
} else if (code.includes(targetCbUnpatched)) {
  code = code.replace(targetCbUnpatched, replaceCb);
  console.log('- Callback redirect patched successfully (from clean base).');
} else if (code.includes('l.returnTo.includes("://")')) {
  console.log('- Callback redirect already patched.');
} else {
  console.error('⚠️ Could not find callback redirect target in index.js');
}

fs.writeFileSync(serverPath, code, 'utf8');
console.log('Server patching finished!');
