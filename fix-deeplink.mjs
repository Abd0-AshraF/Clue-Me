import fs from 'fs';
let html = fs.readFileSync('public/index.html', 'utf8');

const newDeepLink = `
        function handleDeepLinkUrl(urlStr) {
          if (!urlStr) return;
          try {
            var urlObj = new URL(urlStr);
            var pathname = urlObj.pathname.toLowerCase();
            
            // Ignore OAuth callbacks explicitly so Discord login works
            if (pathname.includes('auth') || pathname.includes('oauth') || pathname.includes('discord') || pathname.includes('callback') || pathname.includes('login')) {
              return;
            }

            var roomCode = urlObj.searchParams.get("room");
            if (!roomCode) {
               var code = urlObj.searchParams.get("code");
               // Room codes are short, OAuth codes are long
               if (code && code.length <= 12) roomCode = code;
            }

            if (!roomCode && (urlObj.protocol === "clueme:" || urlObj.protocol === "web+clueme:")) {
              var p = urlObj.pathname.replace(/^\\/\\//, "");
              var parts = p.split("/").filter(Boolean);
              if (parts.length >= 2 && parts[0] === "room") roomCode = parts[1];
              else if (parts.length === 1) roomCode = parts[0];
            }
            if (roomCode && roomCode.length <= 12) {
              var cleanCode = roomCode.toUpperCase().trim();
              if (window.history && window.history.replaceState) {
                var newUrl = window.location.pathname + "?room=" + cleanCode;
                window.history.replaceState(null, "", newUrl);
              }
              window.dispatchEvent(new CustomEvent("clue-me:join-room", { detail: { code: cleanCode } }));
            }
          } catch(e) {}
        }
`.trim();

html = html.replace(/function handleDeepLinkUrl\(urlStr\) \{[\s\S]*?catch\(e\) \{\}\s*\}/, newDeepLink);

fs.writeFileSync('public/index.html', html, 'utf8');
fs.writeFileSync('android/app/src/main/assets/public/index.html', html, 'utf8');
console.log("Patched Deep Link Handler!");
