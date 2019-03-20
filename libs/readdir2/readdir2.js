/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module path-readdir
 */

let { readdirSync, Dirent } = require('fs'),
  { join, parse } = require('path');

module.exports = function readdir2(...args) {
  return readdirSync(...args).map(
    file => (file instanceof Dirent ? ((file.name = join(args[0], file.name)), file) : join(args[0], file))
  );
};

module.exports.parse = function(...args) {
  return module
    .exports(...args)
    .map(v => (v instanceof Dirent ? ((v.parsed = parse(v.name)), v) : { name: v, parsed: parse(v) }));
};
