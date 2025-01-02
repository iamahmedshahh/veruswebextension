export function getManifest() {
  return {
    manifest_version: 3,
    name: 'Verus Web Wallet',
    description: 'Worlds first secure web wallet for Verus Blockchain empowering layer 1 tech',
    version: '1.0.1',
    icons: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    background: {
      service_worker: 'src/background.js',
      type: 'module'
    },
    action: {
      default_popup: 'popup.html',
      default_icon: {
        "16": "icons/icon16.png",
        "32": "icons/icon48.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      }
    },
    permissions: [
      'storage',
      'unlimitedStorage',
      'activeTab',
      'scripting'
    ],
    host_permissions: [
      "<all_urls>"
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    },
    web_accessible_resources: [{
      resources: [
        'provider.js',
        'contentScript.js',
        'assets/*',
        'popup.html',
        'icons/*'
      ],
      matches: ['<all_urls>']
    }]
  };
}
