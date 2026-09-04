import fs from "fs";
const p = "public/assets/index-discord-v30.js";
let c = fs.readFileSync(p, "utf8");

// We need to also delete 'discord_session' from URL search params.
// The code is: le.searchParams.delete("auth"),le.searchParams.delete("error")
// We can change it to: le.searchParams.delete("auth"),le.searchParams.delete("error"),le.searchParams.delete("discord_session")

if (c.includes('le.searchParams.delete("auth"),le.searchParams.delete("error")') && !c.includes('le.searchParams.delete("discord_session")')) {
  c = c.replace(
    'le.searchParams.delete("auth"),le.searchParams.delete("error")',
    'le.searchParams.delete("auth"),le.searchParams.delete("error"),le.searchParams.delete("discord_session")'
  );
  fs.writeFileSync(p, c, "utf8");
  console.log("Patched discord URL cleanup.");
} else {
  console.log("No patch needed or already patched.");
}
