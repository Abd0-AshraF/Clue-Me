const fs = require('fs');
const v29 = fs.readFileSync('public/assets/index-discord-v29.js', 'utf8');
const v31 = fs.readFileSync('public/assets/index-discord-v31.js', 'utf8');

// Find all distinct chunks of differences
let i = 0; let j = 0;
let diffs = [];
while (i < v29.length && j < v31.length) {
  if (v29[i] !== v31[j]) {
    // Look ahead to find sync point
    let sync = -1;
    for (let lookahead = 1; lookahead < 20000; lookahead++) {
      let slice = v31.slice(j + lookahead, j + lookahead + 20);
      let pos = v29.indexOf(slice, i);
      if (pos !== -1) {
        diffs.push({
          v29_removed: v29.slice(i, pos),
          v31_added: v31.slice(j, j + lookahead)
        });
        i = pos;
        j = j + lookahead;
        break;
      }
    }
    if (sync === -1) break; // Lost sync
  }
  i++; j++;
}

for (let d = 0; d < diffs.length; d++) {
  console.log('--- Diff', d);
  console.log('- ' + diffs[d].v29_removed.slice(0, 200));
  console.log('+ ' + diffs[d].v31_added.slice(0, 200));
}
