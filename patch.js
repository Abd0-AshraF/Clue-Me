const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const errorHandler = `
<script>
  window.addEventListener('error', function(e) {
    alert("Error: " + e.message + " at " + e.filename + ":" + e.lineno);
  });
  window.addEventListener('unhandledrejection', function(e) {
    alert("Unhandled Rejection: " + (e.reason && e.reason.message || e.reason));
  });
</script>
`;

if (!html.includes('window.addEventListener(\\\'error\\\'')) {
  html = html.replace('<head>', '<head>' + errorHandler);
  fs.writeFileSync('public/index.html', html, 'utf8');
  fs.writeFileSync('android/app/src/main/assets/public/index.html', html, 'utf8');
}
