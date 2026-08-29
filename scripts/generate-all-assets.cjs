const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 1. Icon SVG with rounded container (512x512 canvas, icon scaled to ~68% size for nice zoom-out padding)
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="120" fill="#17131A"/>
  <!-- Outer glow/border -->
  <rect x="4" y="4" width="504" height="504" rx="116" fill="none" stroke="#322a38" stroke-width="8"/>
  <g transform="translate(96, 96) scale(6.666)">
    <rect width="48" height="48" rx="10" fill="#F5F1E8"/>
    <rect x="7" y="9" width="26" height="22" rx="5.5" fill="#FFFDF8" stroke="#C2B69F" stroke-width="1.6"/>
    <rect x="11.5" y="15" width="16" height="3.4" rx="1.7" fill="#B83A3A"/>
    <rect x="11.5" y="21.6" width="11" height="3.4" rx="1.7" fill="#315C88"/>
    <circle cx="33" cy="31" r="9" fill="none" stroke="#252525" stroke-width="3"/>
    <line x1="39.6" y1="37.6" x2="45" y2="43" stroke="#252525" stroke-width="3.6" stroke-linecap="round"/>
  </g>
</svg>`;

// 2. Adaptive Foreground SVG (transparent background, icon scaled to 52% of 432x432 for Android safe zone)
const fgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
  <g transform="translate(104, 104) scale(4.666)">
    <rect width="48" height="48" rx="10" fill="#F5F1E8"/>
    <rect x="7" y="9" width="26" height="22" rx="5.5" fill="#FFFDF8" stroke="#C2B69F" stroke-width="1.6"/>
    <rect x="11.5" y="15" width="16" height="3.4" rx="1.7" fill="#B83A3A"/>
    <rect x="11.5" y="21.6" width="11" height="3.4" rx="1.7" fill="#315C88"/>
    <circle cx="33" cy="31" r="9" fill="none" stroke="#252525" stroke-width="3"/>
    <line x1="39.6" y1="37.6" x2="45" y2="43" stroke="#252525" stroke-width="3.6" stroke-linecap="round"/>
  </g>
</svg>`;

// 3. Discord Embed Banner SVG (1200x630)
const embedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#17131A"/>
  <!-- Decorative background circle -->
  <circle cx="600" cy="270" r="220" fill="#231d28"/>
  <g transform="translate(480, 150) scale(5)">
    <rect width="48" height="48" rx="10" fill="#F5F1E8"/>
    <rect x="7" y="9" width="26" height="22" rx="5.5" fill="#FFFDF8" stroke="#C2B69F" stroke-width="1.6"/>
    <rect x="11.5" y="15" width="16" height="3.4" rx="1.7" fill="#B83A3A"/>
    <rect x="11.5" y="21.6" width="11" height="3.4" rx="1.7" fill="#315C88"/>
    <circle cx="33" cy="31" r="9" fill="none" stroke="#252525" stroke-width="3"/>
    <line x1="39.6" y1="37.6" x2="45" y2="43" stroke="#252525" stroke-width="3.6" stroke-linecap="round"/>
  </g>
  <text x="600" y="470" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="bold" font-size="44" fill="#FFFDF8" letter-spacing="4">CLUE ME</text>
  <text x="600" y="520" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" fill="#A499B0">لعبة الكلمات والألغاز الجماعية</text>
</svg>`;

// Function to generate splash screen SVG for given dimensions (w, h)
function makeSplashSvg(w, h) {
  const iconSize = Math.min(w, h) * 0.32;
  const scale = iconSize / 48;
  const x = (w - iconSize) / 2;
  const y = (h - iconSize) / 2 - 30;
  const fontSize = Math.max(20, Math.min(w, h) * 0.05);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#17131A"/>
    <g transform="translate(${x}, ${y}) scale(${scale})">
      <rect width="48" height="48" rx="10" fill="#F5F1E8"/>
      <rect x="7" y="9" width="26" height="22" rx="5.5" fill="#FFFDF8" stroke="#C2B69F" stroke-width="1.6"/>
      <rect x="11.5" y="15" width="16" height="3.4" rx="1.7" fill="#B83A3A"/>
      <rect x="11.5" y="21.6" width="11" height="3.4" rx="1.7" fill="#315C88"/>
      <circle cx="33" cy="31" r="9" fill="none" stroke="#252525" stroke-width="3"/>
      <line x1="39.6" y1="37.6" x2="45" y2="43" stroke="#252525" stroke-width="3.6" stroke-linecap="round"/>
    </g>
    <text x="${w / 2}" y="${y + iconSize + fontSize + 20}" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="bold" font-size="${fontSize}" fill="#FFFDF8" letter-spacing="3">CLUE ME</text>
  </svg>`;
}

async function run() {
  console.log('Generating public icons...');
  await sharp(Buffer.from(iconSvg)).png().toFile('public/icon.png');
  await sharp(Buffer.from(iconSvg)).png().toFile('android/app/src/main/assets/public/icon.png');
  await sharp(Buffer.from(embedSvg)).png().toFile('public/discord-embed-v1.png');
  await sharp(Buffer.from(embedSvg)).png().toFile('android/app/src/main/assets/public/discord-embed-v1.png');

  // Mipmap launcher icons
  const mipmaps = [
    { dir: 'mipmap-mdpi', size: 48, fgSize: 108 },
    { dir: 'mipmap-hdpi', size: 72, fgSize: 162 },
    { dir: 'mipmap-xhdpi', size: 96, fgSize: 216 },
    { dir: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
    { dir: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
  ];

  for (const m of mipmaps) {
    const resDir = path.join('android/app/src/main/res', m.dir);
    if (!fs.existsSync(resDir)) fs.mkdirSync(resDir, { recursive: true });

    // ic_launcher.png (full icon)
    await sharp(Buffer.from(iconSvg)).resize(m.size, m.size).png().toFile(path.join(resDir, 'ic_launcher.png'));

    // ic_launcher_round.png (circular icon)
    const circleMask = Buffer.from(
      `<svg width="${m.size}" height="${m.size}"><circle cx="${m.size/2}" cy="${m.size/2}" r="${m.size/2}" fill="#fff"/></svg>`
    );
    await sharp(Buffer.from(iconSvg))
      .resize(m.size, m.size)
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toFile(path.join(resDir, 'ic_launcher_round.png'));

    // ic_launcher_foreground.png (transparent foreground)
    await sharp(Buffer.from(fgSvg)).resize(m.fgSize, m.fgSize).png().toFile(path.join(resDir, 'ic_launcher_foreground.png'));
  }
  console.log('Mipmap launcher icons generated.');

  // Android Splash Screens
  const splashSizes = [
    { dir: 'drawable', w: 2732, h: 2732 },
    { dir: 'drawable-port-mdpi', w: 320, h: 480 },
    { dir: 'drawable-port-hdpi', w: 480, h: 800 },
    { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
    { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
    { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
    { dir: 'drawable-land-mdpi', w: 480, h: 320 },
    { dir: 'drawable-land-hdpi', w: 800, h: 480 },
    { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
    { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
    { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 },
  ];

  for (const s of splashSizes) {
    const splashDir = path.join('android/app/src/main/res', s.dir);
    if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir, { recursive: true });
    const svg = makeSplashSvg(s.w, s.h);
    await sharp(Buffer.from(svg)).png().toFile(path.join(splashDir, 'splash.png'));
  }
  console.log('All splash screens generated successfully.');
}

run().catch(console.error);
