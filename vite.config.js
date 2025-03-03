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
        version: '0.0.4',
        description: 'Help me make the extension that brings native Layer 1 and Web 3 together on The Verus Blockchain',
        permissions: [
          'storage',
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
      }
    })
  ],
  resolve: {
    alias: {
      '@': srcDir,
      'stream': 'stream-browserify',
      'crypto': 'crypto-browserify',
      'buffer': 'buffer',
      'bitcoin-ops/evals.json': path.resolve(__dirname, 'src/utils/bitcoin-ops-evals.json')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    minify: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/pages/popup.html'),
        provider: path.resolve(__dirname, 'src/provider.js')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'provider') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        }
      },
    }
  }
});
