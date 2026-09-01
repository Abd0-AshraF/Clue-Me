const fs = require('fs');
let js = fs.readFileSync('public/assets/index-discord-v31.js', 'utf8');

function check(code) {
  try {
    new Function(code);
    return true;
  } catch(e) {
    return false;
  }
}

if (check(js)) {
  console.log("Valid now??");
  process.exit(0);
}

let left = 0;
let right = js.length;

// This is not a proper binary search because valid prefix might not be a valid JS program
// But we can binary search where the error is thrown if we wrap it in a try-catch, wait no, syntax error happens at parse time.
// If we slice the JS, it will have unbalanced brackets and throw "Unexpected end of input" instead of "Invalid regular expression flags".
