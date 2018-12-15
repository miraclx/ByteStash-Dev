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

var fs = require('fs'),
  _ = require('lodash'); // requires underscore for _.flatten()

function format(n) {
  return n.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,');
}

function getFolderContentSizes(dir) {
  dir = dir.replace(/\/$/, '');
  return _.flatten(
    fs.readdirSync(dir).map(function(file) {
      var fileOrDir = fs.statSync([dir, file].join('/'));
      if (fileOrDir.isFile()) {
        return fileOrDir.size;
      } else if (fileOrDir.isDirectory()) {
        return getFolderSize([dir, file].join('/'));
      }
    })
  );
}

function getFolderSize(dir) {
  return getFolderContentSizes(dir).reduce((a, b) => a + b, 0);
}

function getFileSize(file) {
  return fs.statSync(file).size;
}

module.exports = function sizeOf(content) {
  var single = false;
  if (!Array.isArray(content)) [single, content] = [true, [content]];
  var result = content.map(name => (fs.statSync(name).isDirectory() ? getFolderSize(name) : getFileSize(name)));
  return single ? result[0] : result;
};
