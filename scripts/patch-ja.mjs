import fs from "node:fs";

let js = fs.readFileSync("index.js", "utf8");

let target = 'function Ja(t){let e=process.env.PUBLIC_URL?.trim().replace(/\\/+$/,"");if(e&&/^https?:\\/\\/[^/]+$/i.test(e))return e;let r=t.headers.origin;if(r&&/^https?:\\/\\/[^/]+$/i.test(r))return r;let i=t.headers.referer;if(i)try{let o=new URL(i);return`${o.protocol}//${o.host}`}catch{}let n=t.headers["x-forwarded-proto"]??t.protocol;return`${String(n).split(",")[0]}://${t.get("host")??"localhost"}`}';

let replacement = 'function Ja(t){let e=process.env.PUBLIC_URL?.trim().replace(/\\/+$/,"");if(e&&/^https?:\\/\\/[^/]+$/i.test(e))return e;let r=t.headers.origin;if(r&&/^https?:\\/\\/[^/]+$/i.test(r)&&!r.includes("localhost")&&!r.includes("capacitor://"))return r;let i=t.headers.referer;if(i)try{let o=new URL(i);if(!o.host.includes("localhost")&&!o.host.includes("capacitor"))return`${o.protocol}//${o.host}`}catch{}let n=t.headers["x-forwarded-proto"]??t.protocol;let h=t.get("host")??"localhost";if(!h.includes("localhost"))return`${String(n).split(",")[0]}://${h}`;return e||"https://clueme.wisp.uno"}';

if (js.includes(target)) {
  js = js.replace(target, replacement);
  fs.writeFileSync("index.js", js, "utf8");
  console.log("Successfully patched Ja function in index.js!");
} else {
  console.log("Error: Target Ja function not found in index.js");
}
