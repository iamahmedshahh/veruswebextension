export function getManifest() {
  return {
    manifest_version: 3,
    name: 'Verus Web Wallet',
    description: 'A secure web wallet for Verus cryptocurrency',
    version: '1.0.0',
    background: {
      service_worker: 'background.js',
      type: 'module'
    },
    action: {
      default_popup: 'popup.html'
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
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['contentScript.js'],
        run_at: 'document_start',
        all_frames: true
      }
    ],
    web_accessible_resources: [{
      resources: [
        'provider.js',
        'contentScript.js',
        'assets/*',
        'popup.html'
      ],
      matches: ['<all_urls>']
    }]
  };
}
