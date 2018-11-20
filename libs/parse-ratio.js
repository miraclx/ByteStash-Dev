/**
 * Parse a ratio to a maximum
 * @param {string|number|number[]} ratio The ratio to be parsed and padded (if-required)
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
 */
module.exports = function parseRatio(ratio, max = 100) {
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
        .map(e => parseFloat(e))
        .map(e => (e < 0 ? 0 : e))).reduce((a, b, i) => {
        var result = a + b;
        if (a < max && result < max) {
          return result;
        } else {
          split.splice(i, Infinity);
          return a;
        }
      })) < max
      ? (split.push(max - total), split)
      : total === max
        ? split
        : [100]
  ).map(e => parseFloat(parseFloat(e).toFixed(2)));
  return ratio;
};
