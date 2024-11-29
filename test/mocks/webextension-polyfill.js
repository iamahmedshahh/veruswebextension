const mockStorage = {
    data: {},
    get: async function(keys) {
        if (typeof keys === 'string') {
            return { [keys]: this.data[keys] };
        }
        const result = {};
        keys.forEach(key => {
            result[key] = this.data[key];
        });
        return result;
    },
    set: async function(items) {
        Object.assign(this.data, items);
        return;
    }
};

export default {
    storage: {
        local: mockStorage
    }
};
