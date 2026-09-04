import fs from "fs";
const indexPath = "index.js";
let index = fs.readFileSync(indexPath, "utf8");

index = index.replace(
  /var FI=Number\(process\.env\.PORT\?\?process\.env\.SERVER_PORT\?\?3000\)/g,
  'var FI=3000'
);

fs.writeFileSync(indexPath, index, "utf8");
console.log("Forced PORT to 3000 in index.js");
