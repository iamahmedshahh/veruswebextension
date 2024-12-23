import storage from './StorageService';

/**
 * Service to handle session management and browser close detection
 */
class SessionService {
    constructor() {
        // Handle browser/extension close
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.handleBrowserClose.bind(this));
        }
    }

    /**
     * Handle browser close event
     */
    async handleBrowserClose() {
        try {
            // Don't clear login state if we're in a connection flow
            const state = await storage.get(['isConnecting']);
            if (state.isConnecting) {
                return;
            }
            
            // Clear login state when browser closes
            await storage.set({
                isLoggedIn: false,
                lastLoginTime: null
            });
        } catch (error) {
            console.error('Error handling browser close:', error);
        }
    }

    /**
     * Initialize session service
     */
    static init() {
        if (!SessionService.instance) {
            SessionService.instance = new SessionService();
        }
        return SessionService.instance;
    }
}

export default SessionService;
