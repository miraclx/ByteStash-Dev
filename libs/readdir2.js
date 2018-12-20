/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module path-readdir
 */

let { readdirSync, Dirent } = require('fs'),
  { join } = require('path');

module.exports = function readdir2(...args) {
  return readdirSync(...args).map(
    file => (file instanceof Dirent ? ((file.name = join(args[0], file.name)), file) : join(args[0], file))
  );
};
