import fs from 'fs';
let html = fs.readFileSync('public/index.html', 'utf8');

// Add loading text
html = html.replace('<div id="root"></div>', '<div id="root"><div style="display:flex;height:100vh;width:100vw;align-items:center;justify-content:center;color:#ffffff;font-family:sans-serif;flex-direction:column;gap:10px;"><div class="cm-spinner"></div><p dir="rtl">جاري التحميل...</p></div></div>');

// Add visible error handler
const errorHandler = `
<script>
  window.addEventListener('error', function(e) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:99999;padding:20px;font-size:12px;overflow-wrap:break-word;';
    d.textContent = 'Error: ' + e.message + ' at ' + e.filename + ':' + e.lineno;
    document.body.appendChild(d);
  });
  window.addEventListener('unhandledrejection', function(e) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:99999;padding:20px;font-size:12px;overflow-wrap:break-word;';
    d.textContent = 'Unhandled Rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason);
    document.body.appendChild(d);
  });
</script>
`;

if (!html.includes('background:red;color:white')) {
  html = html.replace('</head>', errorHandler + '</head>');
}

fs.writeFileSync('public/index.html', html, 'utf8');
fs.writeFileSync('android/app/src/main/assets/public/index.html', html, 'utf8');
console.log("Patched HTML");
