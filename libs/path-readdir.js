let fs = require('fs'),
  path = require('path');

module.exports = function readdirSync(...args) {
  return fs.readdirSync(...args).map(file => path.join(args[0], file));
};
