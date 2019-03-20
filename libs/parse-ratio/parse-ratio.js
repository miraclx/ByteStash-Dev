/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module parse-ratio
 */

/**
 * Parse a ratio to a maximum
 * @param {string|number|number[]} ratio The ratio to be parsed and padded (if-required)
 * @param {number} max The maximum value to be summed to
 * @param {number} fixed Number of max digits to appear after the `.`
 * @param {boolean} append Whether or not to append the remainant into the array or add it to the last value
 * @returns {number[]} Array summing up to <max>
 * @example
 *  // String
 *  > parseRatio('10:20');    // => [10,20,70]
 *  > parseRatio('10,15');    // => [10,15,75]
 *  // Number
 *  > parseRatio(62.4);       // => [62.4,37.6]
 *  // Array
 *  > parseRatio([10,5,7,44]) // => [10,5,7,44,34]
 *  // Specifying a maximum count value
 *  > parseRatio([64,128,256], 512) // => [64,128,256,64]
 *  // Unappend the complement
 *  > parseRatio([20,30,40], 100, 15, false) // => [20,30,50]
 */
module.exports = function parseRatio(ratio, max = 100, fixed = 100, append = true) {
  var split, total;
  ratio = (typeof ratio === 'number'
    ? ratio < max
      ? [(ratio = ratio < 0 ? 0 : ratio), max - ratio]
      : ratio === max
        ? [ratio]
        : ratio > max
          ? [max]
          : [0]
    : (total = (split = (typeof ratio === 'string' ? ratio.split(/:|,/g) : Array.isArray(ratio) ? ratio : [0])
        .map(e => +e)
        .map(e => (e < 0 ? 0 : e))).reduce((a, b, i) => {
        var result = a + b;
        if (result <= max) return result;
        else {
          split.splice(i, Infinity, max - result);
          return a + max - result;
        }
      })) < max
      ? (append ? (split[split.length] = max - total) : (split[split.length - 1] += max - total), split)
      : total === max
        ? split
        : [100]
  ).map(e => +(+e.toFixed(fixed)));
  return ratio;
};
