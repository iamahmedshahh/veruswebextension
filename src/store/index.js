import { createStore } from 'vuex';
import wallet from './modules/wallet';

export default createStore({
    modules: {
        wallet
    }
});
