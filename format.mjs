import fs from 'fs';
function format(file) {
  let js = fs.readFileSync(file, 'utf8');
  // Add newlines after ;, {, }, etc
  js = js.replace(/([;{}])/g, '$1\n');
  fs.writeFileSync(file + '.formatted.js', js, 'utf8');
}
format('public/assets/index-discord-v29.js');
format('public/assets/index-discord-v31.js');
