export function getManifest() {
  return {
    manifest_version: 3,
    name: 'Verus Web Wallet',
    description: 'A secure web wallet for Verus cryptocurrency',
    version: '1.0.0',
    background: {
      service_worker: 'src/background.js',
      type: 'module'
    },
    action: {
      default_popup: 'popup.html'
    },
    permissions: [
      'storage',
      'unlimitedStorage',
      'activeTab'
    ],
    host_permissions: [
      "*://*/*"
    ],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['contentScript.js']
      }
    ],
    web_accessible_resources: [{
      resources: [
        'popup.html',
        'assets/*'
      ],
      matches: ['<all_urls>']
    }]
  };
}
