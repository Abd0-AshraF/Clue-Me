import fs from "fs";
const htmlPath = "public/index.html";
let html = fs.readFileSync(htmlPath, "utf8");

// Remove the injected script
html = html.replace(/<script id="cm-apk-btn">[\s\S]*?<\/script>/, "");

fs.writeFileSync(htmlPath, html, "utf8");
console.log("Removed custom injected download button from public/index.html");
