const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '../index.js');
let code = fs.readFileSync(serverPath, 'utf8');

console.log('Patching index.js (server)...');

// 1. Add sendDeepLinkRedirect function helper right before function oo
const sendDeepLinkHelper = `function sendDeepLinkRedirect(res, targetUrl, isError, errorType) {
  const title = isError ? "حدث خطأ أثناء تسجيل الدخول" : "تم تسجيل الدخول بنجاح";
  const desc = isError ? "لم نتمكن من إكمال عملية تسجيل الدخول بنجاح." : "جاري إعادة توجيهك إلى التطبيق تلقائياً خلال ثوانٍ...";
  const btnText = isError ? "العودة للتطبيق" : "افتح اللعبة الآن 🚀";
  
  const html = \`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>Clue Me — جاري العودة للتطبيق</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: radial-gradient(circle at center, #1e1520 0%, #110c13 100%);
      color: #f3f4f6;
      text-align: center;
      padding: 24px;
    }
    .container {
      max-width: 420px;
      width: 100%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 32px 24px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(8px);
    }
    .logo {
      font-size: 48px;
      margin-bottom: 24px;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    h2 {
      font-size: 20px;
      font-weight: 800;
      margin: 0 0 12px 0;
      color: #ffffff;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #9ca3af;
      margin: 0 0 24px 0;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      box-sizing: border-box;
      background-color: #B83A3A;
      color: white;
      padding: 14px 28px;
      border-radius: 16px;
      text-decoration: none;
      font-weight: bold;
      font-size: 16px;
      transition: all 0.2s ease;
      box-shadow: 0 6px 20px rgba(184, 58, 58, 0.3);
    }
    .btn:active {
      transform: scale(0.97);
      background-color: #9c2e2e;
    }
    .spinner {
      border: 3px solid rgba(255,255,255,0.05);
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border-left-color: #B83A3A;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px auto;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <div class="logo">🕵️‍♂️</div>
    <h2>\${title}</h2>
    <p>\${desc}</p>
    <a href="\${targetUrl}" class="btn" id="dlBtn">\${btnText}</a>
  </div>
  <script>
    var target = "\${targetUrl}";
    // Immediately attempt to open deep link
    window.location.replace(target);
    
    // As fallback, trigger after a delay
    setTimeout(function() {
      window.location.href = target;
    }, 400);

    // If the browser still remains here, give user another automatic try
    setTimeout(function() {
      var btn = document.getElementById("dlBtn");
      if(btn) btn.click();
    }, 1200);
  </script>
</body>
</html>\`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}`;

if (!code.includes('function sendDeepLinkRedirect')) {
  const targetPos = code.indexOf('function oo(');
  if (targetPos !== -1) {
    code = code.slice(0, targetPos) + sendDeepLinkHelper + '\n\n' + code.slice(targetPos);
    console.log('- Added sendDeepLinkRedirect helper to index.js');
  } else {
    console.error('⚠️ Could not find target to insert sendDeepLinkRedirect');
  }
} else {
  console.log('- sendDeepLinkRedirect helper already exists.');
}

// 1. Patch zI sanitization to preserve deep link URL scheme (clueme://)
const targetZI = 'function zI(t){';
const replaceZI = 'function zI(t){if(typeof t==="string"&&t.startsWith("clueme://"))return t;';

if (code.includes(targetZI) && !code.includes('startsWith("clueme://")')) {
  code = code.replace(targetZI, replaceZI);
  console.log('- zI sanitization patched to support deep link scheme clueme://');
} else if (code.includes('startsWith("clueme://")')) {
  console.log('- zI sanitization already patched.');
} else {
  console.error('⚠️ Could not find zI function target in index.js');
}

// 2. Patch exchange code endpoint if not already patched
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

// 3. Patch oo (error helper) to handle deep links via HTML page
const oldOo_1 = 'function oo(t,e,r,i){let n=new URLSearchParams({auth:"discord",error:i});let target=r.includes("://")?`${r}?${n.toString()}`:`${e}${r}?${n.toString()}`;t.redirect(302,target)}';
const oldOo_2 = 'function oo(t,e,r,i){let n=new URLSearchParams({auth:"discord",error:i});t.redirect(302,`${e}${r}?${n.toString()}`)}';

const newOo = 'function oo(t,e,r,i){let n=new URLSearchParams({auth:"discord",error:i});let target=r.includes("://")?`${r}?${n.toString()}`:`${e}${r}?${n.toString()}`;if(target.startsWith("clueme://")){sendDeepLinkRedirect(t,target,true,i)}else{t.redirect(302,target)}}';

if (code.includes(oldOo_1)) {
  code = code.replace(oldOo_1, newOo);
  console.log('- Error helper oo patched to support deep link HTML rendering.');
} else if (code.includes(oldOo_2)) {
  code = code.replace(oldOo_2, newOo);
  console.log('- Error helper oo patched to support deep link HTML rendering.');
} else if (code.includes('sendDeepLinkRedirect(t,target,true')) {
  console.log('- Error helper oo already patched.');
}

// 4. Patch callback redirect (success callback) to handle deep links via HTML page
const targetCb_1 = 'c.cookie(Gy,w,{httpOnly:!0,sameSite:"lax",secure:A,maxAge:NI,path:DI});let targetUrl=l.returnTo.includes("://")?`${l.returnTo}?auth=discord&code=${w}`:`${l.origin}${l.returnTo}?auth=discord&code=${w}`;c.redirect(302,targetUrl)';
const targetCb_2 = 'c.cookie(Gy,w,{httpOnly:!0,sameSite:"lax",secure:A,maxAge:NI,path:DI}),c.redirect(302,`${l.origin}${l.returnTo}?auth=discord&code=${w}`)';
const targetCb_3 = 'c.cookie(Gy,w,{httpOnly:!0,sameSite:"lax",secure:A,maxAge:NI,path:DI}),c.redirect(302,`${l.origin}${l.returnTo}?auth=discord`)';

const newCb = 'c.cookie(Gy,w,{httpOnly:!0,sameSite:"lax",secure:A,maxAge:NI,path:DI});let targetUrl=l.returnTo.includes("://")?`${l.returnTo}?auth=discord&code=${w}`:`${l.origin}${l.returnTo}?auth=discord&code=${w}`;if(targetUrl.startsWith("clueme://")){sendDeepLinkRedirect(c,targetUrl,false)}else{c.redirect(302,targetUrl)}';

if (code.includes(targetCb_1)) {
  code = code.replace(targetCb_1, newCb);
  console.log('- Success callback patched (via HTML page rendering).');
} else if (code.includes(targetCb_2)) {
  code = code.replace(targetCb_2, newCb);
  console.log('- Success callback patched (via HTML page rendering).');
} else if (code.includes(targetCb_3)) {
  code = code.replace(targetCb_3, newCb);
  console.log('- Success callback patched (via HTML page rendering).');
} else if (code.includes('sendDeepLinkRedirect(c,targetUrl,false)')) {
  console.log('- Success callback already patched.');
}

fs.writeFileSync(serverPath, code, 'utf8');
console.log('Server patching finished!');
