import browser from 'webextension-polyfill';

/**
 * Storage service that provides a unified interface for both extension storage and localStorage
 */

const storage = {
    async get(keys) {
        try {
            if (typeof browser !== 'undefined' && browser.storage) {
                if (Array.isArray(keys)) {
                    return await browser.storage.local.get(keys);
                } else {
                    const result = await browser.storage.local.get(keys);
                    return result[keys] ? { [keys]: result[keys] } : {};
                }
            } else {
                console.warn('Browser storage not available, using localStorage');
                const result = {};
                const keyArray = Array.isArray(keys) ? keys : [keys];
                keyArray.forEach(key => {
                    const value = localStorage.getItem(key);
                    if (value) {
                        try {
                            result[key] = JSON.parse(value);
                        } catch {
                            result[key] = value;
                        }
                    }
                });
                return result;
            }
        } catch (error) {
            console.warn('Storage get failed, using localStorage:', error);
            const result = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => {
                const value = localStorage.getItem(key);
                if (value) {
                    try {
                        result[key] = JSON.parse(value);
                    } catch {
                        result[key] = value;
                    }
                }
            });
            return result;
        }
    },

    async set(data) {
        try {
            if (typeof browser !== 'undefined' && browser.storage) {
                await browser.storage.local.set(data);
            } else {
                Object.entries(data).forEach(([key, value]) => {
                    localStorage.setItem(key, JSON.stringify(value));
                });
            }
        } catch (error) {
            console.warn('Storage set failed, using localStorage:', error);
            Object.entries(data).forEach(([key, value]) => {
                localStorage.setItem(key, JSON.stringify(value));
            });
        }
    },

    async remove(keys) {
        try {
            if (typeof browser !== 'undefined' && browser.storage) {
                await browser.storage.local.remove(keys);
            } else {
                const keyArray = Array.isArray(keys) ? keys : [keys];
                keyArray.forEach(key => localStorage.removeItem(key));
            }
        } catch (error) {
            console.warn('Storage remove failed, using localStorage:', error);
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => localStorage.removeItem(key));
        }
    },

    async clear() {
        try {
            if (typeof browser !== 'undefined' && browser.storage) {
                await browser.storage.local.clear();
            } else {
                localStorage.clear();
            }
        } catch (error) {
            console.warn('Storage clear failed, using localStorage:', error);
            localStorage.clear();
        }
    },

    session: {
        async get(keys) {
            try {
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
                    return await browser.storage.session.get(keys);
                }
                // Fallback to sessionStorage
                const result = {};
                const keyArray = Array.isArray(keys) ? keys : [keys];
                keyArray.forEach(key => {
                    const value = sessionStorage.getItem(key);
                    if (value) {
                        try {
                            result[key] = JSON.parse(value);
                        } catch {
                            result[key] = value;
                        }
                    }
                });
                return result;
            } catch (error) {
                console.warn('Session storage get failed:', error);
                return {};
            }
        },

        async set(data) {
            try {
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
                    await browser.storage.session.set(data);
                } else {
                    Object.entries(data).forEach(([key, value]) => {
                        sessionStorage.setItem(key, JSON.stringify(value));
                    });
                }
            } catch (error) {
                console.warn('Session storage set failed:', error);
            }
        },

        async remove(keys) {
            try {
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
                    await browser.storage.session.remove(keys);
                } else {
                    const keyArray = Array.isArray(keys) ? keys : [keys];
                    keyArray.forEach(key => sessionStorage.removeItem(key));
                }
            } catch (error) {
                console.warn('Session storage remove failed:', error);
            }
        },

        async clear() {
            try {
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.session) {
                    await browser.storage.session.clear();
                } else {
                    sessionStorage.clear();
                }
            } catch (error) {
                console.warn('Session storage clear failed:', error);
            }
        }
    }
};

export default storage;
