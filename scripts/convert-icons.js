import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [16, 48, 128];
const srcDir = path.join(__dirname, '../src/assets/icons');
const destDir = path.join(__dirname, '../public/icons');

// Create destination directory if it doesn't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

async function convertIcons() {
  for (const size of sizes) {
    const svgPath = path.join(srcDir, `icon${size}.svg`);
    const pngPath = path.join(destDir, `icon${size}.png`);
    
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(pngPath);
    
    console.log(`Converted icon${size}.svg to icon${size}.png`);
  }
}

convertIcons().catch(console.error);
