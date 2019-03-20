let { createReadStream, createWriteStream, statSync } = require('fs'),
  { pipeline } = require('stream'),
  ProgressBar = require('../libs/progress2');

function main(input, output) {
  // ProgressBar needs to know the total size for it to show a detailed bar
  let { size } = statSync(input),
    // Get a stream from input
    inputStream = createReadStream(input),
    // Create an output stream
    outputStream = createWriteStream(output),
    // Generate a Transform Stream that manages the progressBar
    progressGen = ProgressBar.stream(size, 100, {
      bar: { header: '\ue0b0' },
      forceFirst: false,
      progress: { pulsate: true },
      variables: {},
    }),
    // Extract the bar from the generator
    { bar } = progressGen;
  // Pipe all these streams in order
  pipeline(
    inputStream,
    // The progressStream must be inbetween the flow of data so it can measure as data flows through it
    progressGen.next(size),
    outputStream,
    err => (err ? console.log(`An error occurred while copying\n${err}`) : bar.end('Copy Complete\n'))
  );
  // DONE!
}

main(...process.argv.slice(2));

/**
 * node simple_stream file file.copy
 */
