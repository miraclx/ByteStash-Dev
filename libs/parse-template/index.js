/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module parse-template
 */

/**
 * Parse a template, replace parts with specified values
 * @param {String} tmp Template to be parsed
 * @param {*} feats Object containing the object parts with replaceable values
 * @param {string} skip Part of the object to skip when checking
 */

module.exports = function parseTemplate(tmp, feats, rootSkip = []) {
  for (let [tag, data] of Object.entries(feats).filter(slot => !(rootSkip.includes(slot[0]) || !tmp.match(specTify(slot[0]))))) {
    let _ = tmp.match(specTify(tag, '')),
      skip = rootSkip.concat([]),
      regex = specTify(tag),
      result = (data = `${typeof data == 'function' ? data(feats) : data}`).match(specTify('.+'))
        ? parseTemplate(data, feats, (skip.push(tag), skip))
        : data;
    tmp = tmp.replace(regex, _ ? result.padStart(+_[1], ' ') : result);
  }
  return tmp;
};

let specTify = (spec, flags = 'g') => new RegExp('[%$:](\\d*){0%?}'.replace(0, spec), flags);
