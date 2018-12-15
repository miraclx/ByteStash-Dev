/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module path-readdir
 */

let fs = require('fs'),
  path = require('path');

module.exports = function readdirSync(...args) {
  return fs.readdirSync(...args).map(file => path.join(args[0], file));
};
