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

var { statSync } = require('fs'),
  { flattenDeep } = require('lodash'), // requires lodash for flattenDeep()
  readdir2 = require('../readdir2');

function getFolderContentSizes(dir) {
  return readdir2(dir).map(dir => {
    var fileOrDir;
    try {
      if ((fileOrDir = statSync(dir)).isFile()) return fileOrDir.size;
      else if (fileOrDir.isDirectory()) return getFolderContentSizes(dir);
    } catch {
      return 0;
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

module.exports.deep = function getDeepContentSizes(dir) {
  let result = {};
  for (let {
    name,
    parsed: { base },
  } of readdir2.parse(dir)) {
    var fileOrDir;
    try {
      if ((fileOrDir = statSync(name)).isFile()) result[base] = fileOrDir.size;
      else if (fileOrDir.isDirectory()) result[base] = getDeepContentSizes(name);
    } catch {
      return (result[base] = 0);
    }
  }
  return result;
};
