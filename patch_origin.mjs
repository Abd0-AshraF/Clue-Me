import fs from 'fs';
let html = fs.readFileSync('public/index.html', 'utf8');

const polyfill = `
<script>
  if (!window.location.origin) {
    window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port: '');
  }
</script>
`;

if (!html.includes('if (!window.location.origin)')) {
  html = html.replace('<script>', polyfill + '\n    <script>');
}

fs.writeFileSync('public/index.html', html, 'utf8');
fs.writeFileSync('android/app/src/main/assets/public/index.html', html, 'utf8');
console.log("Patched origin");
