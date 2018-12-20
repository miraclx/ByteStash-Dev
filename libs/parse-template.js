/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module parse-template
 */

/**
 * Parse a template, replace parts with specified values
 * @param {String} template Template to be parsed
 * @param {*} features Object containing the object parts with replaceable values
 */
module.exports = function parseTemplate(template, features) {
  for (let spec in features) {
    let regex = new RegExp(`%{${spec}%}`, 'g'),
      replacement = features[spec];
    replacement = typeof replacement == 'function' ? replacement(features) : replacement;
    template = template.replace(
      regex,
      regex.test(replacement) && !replacement.includes(`%{${spec}%}`) ? parseTemplate(replacement, features) : replacement
    );
  }
  return template;
};
