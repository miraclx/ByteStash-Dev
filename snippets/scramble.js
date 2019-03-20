let readline = require('readline-sync'),
  randomiZe = require('../libs/mosr'),
  ProgressBar = require('../libs/progress2');

function ranger(args = '') {
  let input = args.trim(),
    parsed,
    wasGreater;
  if ((parsed = input.match(/^(-?\d+)\.\.(=)?(-?\d+)$/)) !== null) {
    let tmp,
      [min, useMax, max] = [parsed[1], !!parsed[2], parsed[3]].map(
        // eslint-disable-next-line no-cond-assign
        v => ((tmp = parseInt(v)) ? tmp : tmp == 0 ? tmp : v)
      );
    (wasGreater = min > max) && ([min, max] = [max, min]);
    let result = [...Array(Math.floor(max - min + (useMax ? 1 : 0)))].map((...[, i]) => i + min);
    return wasGreater ? result.reverse() : result;
  } else return input.split(',').map(v => parseInt(v) || v);
}

var engine = {
  range(strRange) {
    let original = ranger(strRange),
      randomResult = randomiZe(original);
    return [original, randomResult];
  },
  scramble(word) {
    let original = word.split(''),
      scrambled = randomiZe(original);
    return [word, scrambled.join('')];
  },
  scrambleFile(file, outputFile) {
    let path = require('path');
    let fs = require('fs');

    if (!outputFile) throw Error('Please specify output file');
    [file, outputFile] = [file, outputFile].map(file => path.resolve(file));

    function checkFile(file) {
      if (!readline.keyInYN('Are you sure to overwrite file with scrambled data?')) {
        return readline.questionPath('Please enter output file: ', { exists: false });
      }
      return file;
    }

    if (outputFile == file) outputFile = checkFile(outputFile);

    let progressStream = ProgressBar.stream(fs.statSync(file).size, 100);

    fs.createReadStream(file, { highWaterMark: 50 })
      .pipe(randomiZe.stream)
      .pipe(progressStream.next())
      .pipe(fs.createWriteStream(outputFile));

    return [file, outputFile];
  },
  randomize(strArray) {
    let original = typeof strArray == 'string' ? strArray.split(',') : Array.isArray(strArray) ? strArray : Array.from(strArray);
    return [original, randomiZe(original)];
  },
};

function main() {
  let method = process.argv.slice(2)[0],
    input = process.argv.slice(3),
    output;
  [input, output] = (engine[method] || engine['range']).apply(null, (input.length ? input : input[0]) || [method]);
  console.log('Input:  %j', input);
  console.log('Output: %j', output);
}

main();

/**
 * node scramble.js <method> <input> <?:output>
 * =========================================
 * node scramble.js range 1..=10                          // Create an array, [1,2,...,9,10] and scramble output
 * node scramble.js scramble "Hello There"                // Scramble the string input
 * node scramble.js scrambleFile ./file ./file.scrambled  // Scramble the input file into the output file
 */
