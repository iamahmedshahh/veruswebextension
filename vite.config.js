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
        name: 'Verus Web Wallet',
        version: '0.0.1',
        description: 'A secure web wallet for Verus cryptocurrency',
        permissions: [
          'storage',
          'tabs',
          'activeTab'
        ],
        host_permissions: [
          "http://localhost:5173/*",
          "http://localhost:3000/*"
        ],
        action: {
          default_popup: 'popup.html'
        },
        background: {
          service_worker: 'src/background.js',
          type: 'module'
        },
        content_scripts: [
          {
            matches: [
              "http://localhost:5173/*",
              "http://localhost:3000/*"
            ],
            js: ["src/contentScript.js"],
            run_at: "document_start"
          }
        ],
        web_accessible_resources: [{
          resources: ["provider.js"],
          matches: [
            "http://localhost:5173/*",
            "http://localhost:3000/*"
          ]
        }],
        content_security_policy: {
          extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
        },
        icons: {
          "16": "icons/icon16.png",
          "48": "icons/icon48.png",
          "128": "icons/icon128.png"
        }
      }
    })
  ],
  resolve: {
    alias: {
      '@': srcDir,
      'stream': 'stream-browserify',
      'crypto': 'crypto-browserify'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'popup.html'),
        provider: path.resolve(__dirname, 'src/provider.js')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Keep provider.js name as is
          if (chunkInfo.name === 'provider') {
            return '[name].js';
          }
          // Hash other files
          return 'assets/[name]-[hash].js';
        }
      }
    }
  }
});
