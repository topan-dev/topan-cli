class Logger {
    #name;
    constructor(name) {
        this.#name = name;
    }
    log(message) {
        console.log(`[${this.#name}] ${message}`);
    }
    error(message) {
        console.log(`[${this.#name}] ${message}`);
    }
}

module.exports = Logger;