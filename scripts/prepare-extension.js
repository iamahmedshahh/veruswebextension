import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../dist');
const manifestPath = path.join(distDir, 'manifest.json');

// Read the manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Update paths in the manifest
manifest.background.service_worker = 'background.js';
manifest.content_scripts[0].js = ['contentScript.js'];

// Write the updated manifest
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
