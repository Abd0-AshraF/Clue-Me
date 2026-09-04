import fs from "fs";
const htmlPath = "public/index.html";
let html = fs.readFileSync(htmlPath, "utf8");

// Remove the old injected script
html = html.replace(/<script>\s*window\.addEventListener\('DOMContentLoaded', \(\) => \{\s*if \(\!window\.Capacitor\?\.isNative[\s\S]*?<\/script>/, "");

const scriptToInject = `
    <script id="cm-apk-btn">
      window.addEventListener('DOMContentLoaded', () => {
        if (!window.Capacitor?.isNative && !document.documentElement.classList.contains("cm-discord-activity") && location.search.indexOf("frame_id") === -1) {
          const btn = document.createElement("a");
          btn.href = "/clue-me-latest.apk";
          btn.download = "clue-me-latest.apk";
          btn.innerHTML = \`<div style="display:flex; align-items:center; justify-content:center; gap:8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span style="font-weight:700; font-family:'IBM Plex Sans Arabic', system-ui, sans-serif; font-size:15px; direction:rtl; letter-spacing:0.3px;">حمل اللعبة للأندرويد</span>
          </div>\`;
          btn.style.cssText = "position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#B83A3A; color:#ffffff; padding:12px 24px; border-radius:16px; text-decoration:none; box-shadow:0 8px 32px rgba(184, 58, 58, 0.4), 0 2px 8px rgba(0,0,0,0.4); z-index:999999; transition:all 0.2s cubic-bezier(0.4, 0, 0.2, 1); border:1px solid rgba(255,255,255,0.15); display:inline-block;";
          btn.onmouseover = () => { btn.style.transform = "translateX(-50%) translateY(-3px) scale(1.02)"; btn.style.background = "#c94646"; btn.style.boxShadow = "0 12px 40px rgba(184, 58, 58, 0.5), 0 4px 12px rgba(0,0,0,0.5)"; };
          btn.onmouseout = () => { btn.style.transform = "translateX(-50%) translateY(0) scale(1)"; btn.style.background = "#B83A3A"; btn.style.boxShadow = "0 8px 32px rgba(184, 58, 58, 0.4), 0 2px 8px rgba(0,0,0,0.4)"; };
          btn.onmousedown = () => { btn.style.transform = "translateX(-50%) translateY(1px) scale(0.98)"; };
          document.body.appendChild(btn);
        }
      });
    </script>
`;

html = html.replace("</head>", scriptToInject + "</head>");
fs.writeFileSync(htmlPath, html, "utf8");
console.log("Injected updated download button script into public/index.html");
