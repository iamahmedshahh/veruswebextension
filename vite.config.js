import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import webExtension from '@samrum/vite-plugin-web-extension';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, 'src');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true
      },
      protocolImports: true
    }),
    webExtension({
      manifest: {
        manifest_version: 3,
        name: 'Layer VOne (Testnet)',
        version: '0.0.5',
        description: 'Help me make the extension that brings native Layer 1 and Web 3 together on The Verus Blockchain',
        icons: {
          "16": "icons/logo.png",
          "48": "icons/logo.png",
          "128": "icons/logo.png"
        },
        permissions: [
          'storage',
          'activeTab',
          'scripting',
          'tabs',
          'windows'
        ],
        host_permissions: [
          "http://localhost:*/*",
          "https://*/*"
        ],
        action: {
          default_popup: 'popup.html',
          default_icon: {
            "16": "icons/logo.png",
            "48": "icons/logo.png",
            "128": "icons/logo.png"
          }
        },
        background: {
          service_worker: 'src/background.js'
        },
        content_scripts: [
          {
            matches: ["http://localhost:*/*", "https://*/*"],
            js: ["src/contentScript.js"],
            run_at: "document_start"
          }
        ],
        web_accessible_resources: [
          {
            resources: ["src/provider.js"],
            matches: ["http://localhost:*/*", "https://*/*"]
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background.js'),
        contentScript: path.resolve(__dirname, 'src/contentScript.js'),
        provider: path.resolve(__dirname, 'src/provider.js')
      },
      output: {
        entryFileNames: 'src/[name].js'
      }
    }
  }
});