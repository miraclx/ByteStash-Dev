"use strict";
exports.__esModule = true;
var crypto = require("crypto");
var parent = {
    key: crypto.randomBytes(32).toString('hex'),
    tag: crypto.randomBytes(16).toString('hex'),
    size: 1024,
    type: 0,
    compression: 1
};
var chunk = {
    stream: null, meta: {
        parent: parent, specs: {
            iv: crypto.randomBytes(16).toString('hex'),
            tag: crypto.randomBytes(16).toString('hex'),
            file: crypto.randomBytes(32).toString('hex') + ".xpart",
            size: 1024
        }
    }
};
console.log(chunk);
