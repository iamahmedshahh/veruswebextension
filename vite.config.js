import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import webExtension from '@samrum/vite-plugin-web-extension';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
          'unlimitedStorage',
          'activeTab'
        ],
        host_permissions: [
          "https://api.verustest.net/*",
          "https://*.verustest.net/*"
        ],
        action: {
          default_popup: 'index.html'
        },
        background: {
          service_worker: 'src/background.js',
          type: 'module'
        }
      },
      additionalInputs: {
        scripts: [
          'src/background.js'
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'stream': 'stream-browserify',
      'crypto': 'crypto-browserify'
    }
  },
  build: {
    rollupOptions: {
      input: {
        background: 'src/background.js',
        popup: 'index.html'
      },
      output: {
        entryFileNames: '[name].js'
      }
    }
  }
});
