/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module mosr
 */

let through = require('through2');

/**
 * Truly randomly sort an array with the middle-random-index-swap
 * @param {any[]} rawArr The Array of similar types
 */
function randomiZe(rawArr) {
  if (!(Array.isArray(rawArr) || Buffer.isBuffer(rawArr))) throw Error(`<rawArr:${typeof rawArr}> is not an Array`);
  if (rawArr.length <= 1) return rawArr;
  function rotateArray(array, clockwise) {
    let stagedArray = Array(array.length),
      assignIndex;
    array.forEach((slotValue, slotIndex) => {
      stagedArray[
        ((assignIndex = slotIndex + (clockwise ? 1 : -1)),
        assignIndex < 0 ? array.length + assignIndex : assignIndex >= array.length ? assignIndex - array.length : assignIndex)
      ] = slotValue;
    });
    return stagedArray;
  }
  let localArray = Array.from(rawArr);
  for (let currentIndex = 0; currentIndex < rawArr.length; currentIndex++) {
    let swapValue = localArray.shift(0, 1);
    let random = Math.floor(Math.random() * localArray.length);
    [swapValue, localArray[random]] = [localArray[random], swapValue];
    let clockwise = Math.floor(Math.random() * 10) % 2 == 0;
    localArray = rotateArray(localArray, clockwise);
    localArray.splice(random, 0, swapValue);
  }
  return (Array.isArray(rawArr) ? Array.from : Buffer.from)(localArray);
}

module.exports = randomiZe;

randomiZe.stream = through(function(chunk, encoding, callback) {
  this.push(randomiZe(chunk));
  callback();
});
