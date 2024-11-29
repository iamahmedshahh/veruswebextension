import { createStore } from 'vuex';
import wallet from './modules/wallet';
import currencies from './modules/currencies';

export default createStore({
    modules: {
        wallet,
        currencies
    }
});
