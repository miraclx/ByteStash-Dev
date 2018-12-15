let fs = require('fs'),
  path = require('path'),
  stream = require('stream'),
  crypto = require('crypto'),
  Promise = require('bluebird'),
  totalSize = require('../libs/total-size'),
  pathReadDir = require('../libs/path-readdir'),
  ProgressBar = require('../libs/ProgressBar'),
  { ReadChunker, ReadMerger } = require('../libs/split-merge');

function getWriter(chunker, showCuts, printAtAll = 'y') {
  let authKeys = ['y', 'yes', 'yep', 'true'];
  return stream.Writable({
    objectMode: true,
    write([data, chunkPartData, chunkData], _encoding, next) {
      if (authKeys.includes(printAtAll) && showCuts)
        console.log(
          'Recieved data:',
          `${chunkData.finalChunk ? '*' : ''}${chunkPartData.finalPart ? '!' : ' '}${chunkData.number}`.padStart(
            `${chunker.spec.numberOfParts}`.length + 2,
            ' '
          ),
          ...(authKeys.includes(showCuts)
            ? [
                `[${data
                  .toString('hex')
                  .padEnd(chunker.spec.splitSize * 2, '.')
                  .replace(/(.)(?=(.{2})+$)/g, '$1 ')}]`,
                '<=>',
                `|${data
                  .toString('ascii')
                  .replace(/\n/g, '↵')
                  .padEnd(chunker.spec.splitSize, '.')}|` || '',
              ]
            : [`Size: ${chunkPartData.size}`])
        );
      next();
    },
  });
}

function prepareProgress(size, slots) {
  let progressStream = ProgressBar.stream(size, slots, {
    bar: {
      blank: '-',
      filler: '=',
      header: '>',
      color: ['bgRed', 'white'],
    },
    template: [
      '%{attachedMessage%}',
      '%{label%}|%{slot:bar%}| %{percentage%}% %{eta%}s [%{slot:size%}/%{slot:size:total%}]',
      'Total:%{bar%} %{_percentage%}% %{_eta%}s [%{size%}/%{size:total%}]',
    ],
    forceFirst: true,
    _template: {
      bar({ bar }) {
        return `${bar ? `   [${bar}]` : ''}`;
      },
      eta({ eta }) {
        return `${eta}`.padStart(3, ' ');
      },
      _eta(feats) {
        return `${feats['slot:eta']}`.padStart(3, ' ');
      },
      label({ label }) {
        return `${label}:`.padEnd(9, ' ');
      },
      percentage({ percentage }) {
        return `${percentage}`.padStart(3, ' ');
      },
      _percentage(feats) {
        return `${feats['slot:percentage']}`.padStart(3, ' ');
      },
    },
  });
  progressStream.bar.label('Loading');
  return progressStream;
}

function mainChunk(file, output, parseOutput, callback) {
  let { size } = fs.statSync(file);

  if (parseOutput[0]) {
    let reader = fs.createReadStream(file, {
      highWaterMark: parseOutput[1] == 'y' ? 27 : 16 ** 4,
    });

    let chunker = new ReadChunker({
      size: parseOutput[1] == 'y' ? 30 : null,
      length: 50,
      total: size,
      appendOverflow: false,
    });
    console.log('Parse, not write', chunker.spec);

    let chunkerOutput = getWriter(chunker, ...parseOutput.slice(1, Infinity)).on('finish', () => console.log('All Done'));
    chunkerOutput.on('finish', callback);
    reader.pipe(chunker).pipe(chunkerOutput);
  } else {
    let reader = fs.createReadStream(file, {
      highWaterMark: 16 ** 4,
    });

    let chunker = new ReadChunker({
      length: 50,
      total: size,
      appendOverflow: false,
    });

    console.log('Write, attach progressBar', chunker.spec);

    let chunkerOutput = chunker.fiss(output);

    let slots = [...Array(chunker.spec.numberOfParts)].map(
      (...[, index]) =>
        index + 1 !== chunker.spec.numberOfParts ? chunker.spec.splitSize : chunker.spec.lastSplitSize || chunker.spec.splitSize
    );

    let progressStream = prepareProgress(size, ProgressBar.slotsBySize(size, slots));

    chunker.use('progressBar', ([{ chunkSize }, file], _persist) =>
      progressStream.next(chunkSize, {
        _template: { attachedMessage: `Writing to ${file}` },
      })
    );

    progressStream.on('complete', bar => bar.end('Complete\n')).on('complete', callback);
    reader.pipe(chunker).pipe(chunkerOutput);
  }
}

function mainMerge(input, output, callback) {
  let size = totalSize(input);
  let inputBlocks = (fs.statSync(input).isDirectory() ? pathReadDir(input) : [input]).map(file => [
    fs.statSync(file).size,
    fs.createReadStream(file),
  ]);

  let merger = new ReadMerger(),
    mergeStash = merger.fuse(...inputBlocks);

  let progressStream = prepareProgress(size, ProgressBar.slotsBySize(size, inputBlocks.map(block => block[0]))),
    { bar } = progressStream;

  merger.use('progressBar', ([size], _persist) =>
    progressStream.next(size, {
      _template: { attachedMessage: `Writing to ${output}` },
    })
  );

  progressStream.on('complete', () => bar.end('Complete\n'));
  if (callback) progressStream.on('complete', callback);

  mergeStash.pipe(merger).pipe(fs.createWriteStream(output));
}

mainChunk('./resource/block_file.xtash', `./test.dir/ground0/f1/results%{_number%}.file`, process.argv.slice(2), () => {
  mainMerge(`./test.dir/ground0/f1`, './test.dir/ground0/block.block');
});

/**
 * node splitr.js
 */

function attachPipesTo(reader, chunker, chunkerOutput) {
  console.time('reader end');
  console.time('reader data');
  console.time('reader close');
  console.time('reader finish');

  console.time('chunker end');
  console.time('chunker close');
  console.time('chunker data');
  console.time('chunker drain');
  console.time('chunker finish');
  console.time('chunker complete');

  console.time('middleware data');
  console.time('middleware progress');

  console.time('writer close');
  console.time('writer drain');
  console.time('writer finish');
  console.time('writer complete');

  console.time('process complete');

  reader
    .on('end', () => console.timeEnd('reader end'))
    .on('data', () => console.timeLog('reader data'))
    .on('error', error => console.log(`An error occurred ${error}`))
    .on('close', () => console.timeEnd('reader close'))
    .on('finish', () => console.timeEnd('reader finish'));

  chunker
    .on('end', () => console.timeEnd('chunker end'))
    .on('data', () => console.timeLog('chunker data'))
    .on('drain', () => console.timeLog('chunker drain')) // For every input data, i.e stream into chunk, when called back
    .on('error', error => console.log(`An error occurred ${error}`))
    .on('close', () => console.timeEnd('chunker close'))
    .on('finish', () => console.timeEnd('chunker finish'))
    .on('complete', () => console.timeEnd('chunker complete'));

  chunker.use(
    '_pipe:debug',
    () =>
      new stream.Transform({
        transform(v, e, c) {
          console.timeLog('middleware data');
          c(null, v);
        },
      })
  );

  chunkerOutput
    .on('close', () => console.timeEnd('writer close'))
    .on('drain', () => console.timeLog('writer drain'))
    .on('error', error => console.log(`An error occurred ${error}`))
    .on('finish', () => console.timeEnd('writer finish'))
    .on('complete', () => console.timeEnd('writer complete'));

  process.on('exit', () => console.timeEnd('process complete'));
}

// Promise.mapSeries(
//   ['./resource/10kb_file.txt', './resource/100mb_file.txt', './resource/500mb_file.txt', './resource/500mb_file.txt'],
//   (file, index) =>
//     new Promise((resolve, reject) => {
//       mainChunk(file, `./test.dir/heap/f${index + 1}/results%{_number%}.file`, process.argv.slice(2))
//         .on('finish', resolve)
//         .on('error', reject);
//     })
// );
