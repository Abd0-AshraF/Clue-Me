import fs from 'fs';
let cap = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
if (cap.plugins && cap.plugins.StatusBar) {
  cap.plugins.StatusBar.overlaysWebView = true;
  cap.plugins.StatusBar.backgroundColor = "#00000000";
}
fs.writeFileSync('capacitor.config.json', JSON.stringify(cap, null, 2), 'utf8');

// Also update the index.html initialization where it overrides the statusbar
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('StatusBar.setOverlaysWebView({ overlay: false })', 'StatusBar.setOverlaysWebView({ overlay: true })');
html = html.replace('StatusBar.setBackgroundColor({ color: "#17131a" })', 'StatusBar.setBackgroundColor({ color: "#00000000" })');
fs.writeFileSync('public/index.html', html, 'utf8');
fs.writeFileSync('android/app/src/main/assets/public/index.html', html, 'utf8');
