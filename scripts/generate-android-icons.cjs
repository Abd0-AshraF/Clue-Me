const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sourceIcon = path.join(__dirname, '../public/icon-512.png');
const resDir = path.join(__dirname, '../android/app/src/main/res');

const densities = [
  { folder: 'mipmap-mdpi', launcherSize: 48, fgCanvasSize: 108, fgIconSize: 72 },
  { folder: 'mipmap-hdpi', launcherSize: 72, fgCanvasSize: 162, fgIconSize: 108 },
  { folder: 'mipmap-xhdpi', launcherSize: 96, fgCanvasSize: 216, fgIconSize: 144 },
  { folder: 'mipmap-xxhdpi', launcherSize: 144, fgCanvasSize: 324, fgIconSize: 216 },
  { folder: 'mipmap-xxxhdpi', launcherSize: 192, fgCanvasSize: 432, fgIconSize: 288 },
];

async function generateIcons() {
  console.log('Generating Android launcher icons from:', sourceIcon);
  
  for (const d of densities) {
    const targetDir = path.join(resDir, d.folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Standard ic_launcher.png
    await sharp(sourceIcon)
      .resize(d.launcherSize, d.launcherSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(targetDir, 'ic_launcher.png'));

    // 2. Round ic_launcher_round.png
    await sharp(sourceIcon)
      .resize(d.launcherSize, d.launcherSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_round.png'));

    // 3. Adaptive Foreground ic_launcher_foreground.png (padded inside 108dp canvas)
    const resizedLogo = await sharp(sourceIcon)
      .resize(d.fgIconSize, d.fgIconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    const padding = Math.round((d.fgCanvasSize - d.fgIconSize) / 2);

    await sharp({
      create: {
        width: d.fgCanvasSize,
        height: d.fgCanvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: resizedLogo, top: padding, left: padding }])
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));

    console.log(`✓ Generated icons for ${d.folder}`);
  }

  // Update background color in values/ic_launcher_background.xml
  const valuesDir = path.join(resDir, 'values');
  const bgXmlPath = path.join(valuesDir, 'ic_launcher_background.xml');
  fs.writeFileSync(
    bgXmlPath,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#17131A</color>\n</resources>\n`,
    'utf8'
  );
  console.log('✓ Updated ic_launcher_background to #17131A');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
