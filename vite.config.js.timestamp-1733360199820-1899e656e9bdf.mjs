// vite.config.js
import { defineConfig } from "file:///home/ahmed/veruswebwallet/node_modules/vite/dist/node/index.js";
import vue from "file:///home/ahmed/veruswebwallet/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import webExtension from "file:///home/ahmed/veruswebwallet/node_modules/@samrum/vite-plugin-web-extension/dist/index.mjs";
import { nodePolyfills } from "file:///home/ahmed/veruswebwallet/node_modules/vite-plugin-node-polyfills/dist/index.js";
import path from "path";
import { fileURLToPath } from "url";
var __vite_injected_original_import_meta_url = "file:///home/ahmed/veruswebwallet/vite.config.js";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var srcDir = path.resolve(__dirname, "src");
var vite_config_default = defineConfig({
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
        name: "Verus Web Wallet",
        version: "0.0.1",
        description: "A secure web wallet for Verus cryptocurrency",
        permissions: [
          "storage",
          "tabs",
          "activeTab"
        ],
        host_permissions: [
          "http://localhost:*/*",
          "http://127.0.0.1:*/*",
          "https://*/*"
        ],
        action: {
          default_popup: "index.html"
        },
        background: {
          service_worker: "src/background.js",
          type: "module"
        },
        content_scripts: [
          {
            matches: [
              "http://localhost:*/*",
              "http://127.0.0.1:*/*",
              "https://*/*"
            ],
            js: ["src/contentScript.js"],
            run_at: "document_start"
          }
        ],
        web_accessible_resources: [
          {
            resources: [
              "src/provider.js",
              "src/initProvider.js"
            ],
            matches: [
              "http://localhost:*/*",
              "http://127.0.0.1:*/*",
              "https://*/*"
            ]
          }
        ],
        icons: {
          "16": "icons/icon16.png",
          "48": "icons/icon48.png",
          "128": "icons/icon128.png"
        }
      },
      webExtConfig: {
        startUrl: ["http://localhost:5173"],
        target: ["chrome-mv3"],
        reloadOnChange: true,
        port: 8181
      }
    })
  ],
  resolve: {
    alias: {
      "@": srcDir,
      "stream": "stream-browserify",
      "crypto": "crypto-browserify"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === "development",
    rollupOptions: {
      output: {
        entryFileNames: (chunkInfo) => {
          const name = chunkInfo.name.replace("src/", "");
          return `${name}`;
        },
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "manifest.json") {
            return "manifest.json";
          }
          return "assets/[name].[hash].[ext]";
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9haG1lZC92ZXJ1c3dlYndhbGxldFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvYWhtZWQvdmVydXN3ZWJ3YWxsZXQvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvYWhtZWQvdmVydXN3ZWJ3YWxsZXQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJztcbmltcG9ydCB3ZWJFeHRlbnNpb24gZnJvbSAnQHNhbXJ1bS92aXRlLXBsdWdpbi13ZWItZXh0ZW5zaW9uJztcbmltcG9ydCB7IG5vZGVQb2x5ZmlsbHMgfSBmcm9tICd2aXRlLXBsdWdpbi1ub2RlLXBvbHlmaWxscyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICd1cmwnO1xuXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcbmNvbnN0IHNyY0RpciA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMnKTtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICB2dWUoKSxcbiAgICBub2RlUG9seWZpbGxzKHtcbiAgICAgIGdsb2JhbHM6IHtcbiAgICAgICAgQnVmZmVyOiB0cnVlLFxuICAgICAgICBnbG9iYWw6IHRydWUsXG4gICAgICAgIHByb2Nlc3M6IHRydWVcbiAgICAgIH0sXG4gICAgICBwcm90b2NvbEltcG9ydHM6IHRydWVcbiAgICB9KSxcbiAgICB3ZWJFeHRlbnNpb24oe1xuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgbWFuaWZlc3RfdmVyc2lvbjogMyxcbiAgICAgICAgbmFtZTogJ1ZlcnVzIFdlYiBXYWxsZXQnLFxuICAgICAgICB2ZXJzaW9uOiAnMC4wLjEnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0Egc2VjdXJlIHdlYiB3YWxsZXQgZm9yIFZlcnVzIGNyeXB0b2N1cnJlbmN5JyxcbiAgICAgICAgcGVybWlzc2lvbnM6IFtcbiAgICAgICAgICAnc3RvcmFnZScsXG4gICAgICAgICAgJ3RhYnMnLFxuICAgICAgICAgICdhY3RpdmVUYWInXG4gICAgICAgIF0sXG4gICAgICAgIGhvc3RfcGVybWlzc2lvbnM6IFtcbiAgICAgICAgICBcImh0dHA6Ly9sb2NhbGhvc3Q6Ki8qXCIsXG4gICAgICAgICAgXCJodHRwOi8vMTI3LjAuMC4xOiovKlwiLFxuICAgICAgICAgIFwiaHR0cHM6Ly8qLypcIlxuICAgICAgICBdLFxuICAgICAgICBhY3Rpb246IHtcbiAgICAgICAgICBkZWZhdWx0X3BvcHVwOiAnaW5kZXguaHRtbCdcbiAgICAgICAgfSxcbiAgICAgICAgYmFja2dyb3VuZDoge1xuICAgICAgICAgIHNlcnZpY2Vfd29ya2VyOiAnc3JjL2JhY2tncm91bmQuanMnLFxuICAgICAgICAgIHR5cGU6ICdtb2R1bGUnXG4gICAgICAgIH0sXG4gICAgICAgIGNvbnRlbnRfc2NyaXB0czogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIG1hdGNoZXM6IFtcbiAgICAgICAgICAgICAgXCJodHRwOi8vbG9jYWxob3N0OiovKlwiLFxuICAgICAgICAgICAgICBcImh0dHA6Ly8xMjcuMC4wLjE6Ki8qXCIsXG4gICAgICAgICAgICAgIFwiaHR0cHM6Ly8qLypcIlxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGpzOiBbXCJzcmMvY29udGVudFNjcmlwdC5qc1wiXSxcbiAgICAgICAgICAgIHJ1bl9hdDogXCJkb2N1bWVudF9zdGFydFwiXG4gICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICB3ZWJfYWNjZXNzaWJsZV9yZXNvdXJjZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgXCJzcmMvcHJvdmlkZXIuanNcIixcbiAgICAgICAgICAgICAgXCJzcmMvaW5pdFByb3ZpZGVyLmpzXCJcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBtYXRjaGVzOiBbXG4gICAgICAgICAgICAgIFwiaHR0cDovL2xvY2FsaG9zdDoqLypcIixcbiAgICAgICAgICAgICAgXCJodHRwOi8vMTI3LjAuMC4xOiovKlwiLFxuICAgICAgICAgICAgICBcImh0dHBzOi8vKi8qXCJcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIGljb25zOiB7XG4gICAgICAgICAgXCIxNlwiOiBcImljb25zL2ljb24xNi5wbmdcIixcbiAgICAgICAgICBcIjQ4XCI6IFwiaWNvbnMvaWNvbjQ4LnBuZ1wiLFxuICAgICAgICAgIFwiMTI4XCI6IFwiaWNvbnMvaWNvbjEyOC5wbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgd2ViRXh0Q29uZmlnOiB7XG4gICAgICAgIHN0YXJ0VXJsOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MyddLFxuICAgICAgICB0YXJnZXQ6IFsnY2hyb21lLW12MyddLFxuICAgICAgICByZWxvYWRPbkNoYW5nZTogdHJ1ZSxcbiAgICAgICAgcG9ydDogODE4MVxuICAgICAgfVxuICAgIH0pXG4gIF0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBzcmNEaXIsXG4gICAgICAnc3RyZWFtJzogJ3N0cmVhbS1icm93c2VyaWZ5JyxcbiAgICAgICdjcnlwdG8nOiAnY3J5cHRvLWJyb3dzZXJpZnknXG4gICAgfVxuICB9LFxuICBidWlsZDoge1xuICAgIG91dERpcjogJ2Rpc3QnLFxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxuICAgIHNvdXJjZW1hcDogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdkZXZlbG9wbWVudCcsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAoY2h1bmtJbmZvKSA9PiB7XG4gICAgICAgICAgLy8gUmVtb3ZlIHRoZSAnc3JjLycgcHJlZml4IGZyb20gdGhlIGZpbGVuYW1lXG4gICAgICAgICAgY29uc3QgbmFtZSA9IGNodW5rSW5mby5uYW1lLnJlcGxhY2UoJ3NyYy8nLCAnJyk7XG4gICAgICAgICAgcmV0dXJuIGAke25hbWV9YDtcbiAgICAgICAgfSxcbiAgICAgICAgY2h1bmtGaWxlTmFtZXM6ICdhc3NldHMvW25hbWVdLltoYXNoXS5qcycsXG4gICAgICAgIGFzc2V0RmlsZU5hbWVzOiAoYXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgaWYgKGFzc2V0SW5mby5uYW1lID09PSAnbWFuaWZlc3QuanNvbicpIHtcbiAgICAgICAgICAgIHJldHVybiAnbWFuaWZlc3QuanNvbic7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiAnYXNzZXRzL1tuYW1lXS5baGFzaF0uW2V4dF0nO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBZ1EsU0FBUyxvQkFBb0I7QUFDN1IsT0FBTyxTQUFTO0FBQ2hCLE9BQU8sa0JBQWtCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHFCQUFxQjtBQUw4SCxJQUFNLDJDQUEyQztBQU83TSxJQUFNLFlBQVksS0FBSyxRQUFRLGNBQWMsd0NBQWUsQ0FBQztBQUM3RCxJQUFNLFNBQVMsS0FBSyxRQUFRLFdBQVcsS0FBSztBQUc1QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxJQUFJO0FBQUEsSUFDSixjQUFjO0FBQUEsTUFDWixTQUFTO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsTUFDWDtBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsSUFDbkIsQ0FBQztBQUFBLElBQ0QsYUFBYTtBQUFBLE1BQ1gsVUFBVTtBQUFBLFFBQ1Isa0JBQWtCO0FBQUEsUUFDbEIsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFFBQ1QsYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLFVBQ1g7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Y7QUFBQSxRQUNBLGtCQUFrQjtBQUFBLFVBQ2hCO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNGO0FBQUEsUUFDQSxRQUFRO0FBQUEsVUFDTixlQUFlO0FBQUEsUUFDakI7QUFBQSxRQUNBLFlBQVk7QUFBQSxVQUNWLGdCQUFnQjtBQUFBLFVBQ2hCLE1BQU07QUFBQSxRQUNSO0FBQUEsUUFDQSxpQkFBaUI7QUFBQSxVQUNmO0FBQUEsWUFDRSxTQUFTO0FBQUEsY0FDUDtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRjtBQUFBLFlBQ0EsSUFBSSxDQUFDLHNCQUFzQjtBQUFBLFlBQzNCLFFBQVE7QUFBQSxVQUNWO0FBQUEsUUFDRjtBQUFBLFFBQ0EsMEJBQTBCO0FBQUEsVUFDeEI7QUFBQSxZQUNFLFdBQVc7QUFBQSxjQUNUO0FBQUEsY0FDQTtBQUFBLFlBQ0Y7QUFBQSxZQUNBLFNBQVM7QUFBQSxjQUNQO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNGO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxRQUNBLE9BQU87QUFBQSxVQUNMLE1BQU07QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLE1BQ0EsY0FBYztBQUFBLFFBQ1osVUFBVSxDQUFDLHVCQUF1QjtBQUFBLFFBQ2xDLFFBQVEsQ0FBQyxZQUFZO0FBQUEsUUFDckIsZ0JBQWdCO0FBQUEsUUFDaEIsTUFBTTtBQUFBLE1BQ1I7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxVQUFVO0FBQUEsTUFDVixVQUFVO0FBQUEsSUFDWjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLGFBQWE7QUFBQSxJQUNiLFdBQVcsUUFBUSxJQUFJLGFBQWE7QUFBQSxJQUNwQyxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixnQkFBZ0IsQ0FBQyxjQUFjO0FBRTdCLGdCQUFNLE9BQU8sVUFBVSxLQUFLLFFBQVEsUUFBUSxFQUFFO0FBQzlDLGlCQUFPLEdBQUcsSUFBSTtBQUFBLFFBQ2hCO0FBQUEsUUFDQSxnQkFBZ0I7QUFBQSxRQUNoQixnQkFBZ0IsQ0FBQyxjQUFjO0FBQzdCLGNBQUksVUFBVSxTQUFTLGlCQUFpQjtBQUN0QyxtQkFBTztBQUFBLFVBQ1Q7QUFDQSxpQkFBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
