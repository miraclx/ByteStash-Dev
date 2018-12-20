/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module total-size
 */

/**
 * usage
 * DIR='public/js' node directory-size.js
 * => "size of public/js is: 12,432
 */

var { statSync, readdirSync } = require('fs'),
  { flattenDeep } = require('lodash'); // requires lodash for flattenDeep()

function getFolderContentSizes(dir) {
  dir = dir.replace(/\/$/, '');
  return readdirSync(dir).map(function(file) {
    var fileOrDir = statSync([dir, file].join('/'));
    if (fileOrDir.isFile()) {
      return fileOrDir.size;
    } else if (fileOrDir.isDirectory()) {
      return getFolderContentSizes([dir, file].join('/'));
    }
  });
}

function getFolderSize(dir) {
  return flattenDeep(getFolderContentSizes(dir)).reduce((a, b) => a + b, 0);
}

function getFileSize(file) {
  return statSync(file).size;
}

module.exports = function sizeOf(content) {
  var single = false;
  if (!Array.isArray(content)) [single, content] = [true, [content]];
  var result = content.map(name => (statSync(name).isDirectory() ? getFolderSize(name) : getFileSize(name)));
  return single ? result[0] : result;
};

module.exports.getFolderContentSizes = getFolderContentSizes;
