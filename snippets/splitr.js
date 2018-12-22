let fs = require('fs'),
  path = require('path'),
  stream = require('stream'),
  crypto = require('crypto'),
  Promise = require('bluebird'),
  totalSize = require('../libs/total-size'),
  readdir2 = require('../libs/readdir2'),
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

function prepareProgress(size, slots, opts) {
  let progressStream = ProgressBar.stream(size, slots, {
    bar: {
      filler: '=',
      header: '\ue0b0',
      color: ['bgRed', 'white'],
    },
    template: [
      '%{attachedMessage%}',
      '%{label%}|%{slot:bar%}| %{_percentage%}% %{_eta%}s [%{slot:size%}/%{slot:size:total%}]',
      'Total:%{bar%} %{percentage%}% %{eta%}s [%{size%}/%{size:total%}]',
    ],
    ...opts,
  });
  progressStream.bar.label('Loading');
  return progressStream;
}

function _chunk(file, showCuts, printAtAll) {
  let { size } = fs.statSync(file);

  let reader = fs.createReadStream(file, {
    highWaterMark: showCuts == 'y' ? 27 : 16 ** 4,
  });

  let chunker = new ReadChunker({
    size: showCuts == 'y' ? 30 : null,
    length: 50,
    total: size,
    appendOverflow: false,
  });

  console.log('Parse, not write', chunker.spec);

  let chunkerOutput = getWriter(chunker, showCuts, printAtAll || 'y').on('finish', () => console.log('All Done'));
  reader.pipe(chunker).pipe(chunkerOutput);
}

function mainChunk(file, output, callback) {
  let { size } = fs.statSync(file);
  let reader = fs.createReadStream(file, {
      highWaterMark: 16 ** 4,
    }),
    chunker = new ReadChunker({
      length: 50,
      total: size,
      appendOverflow: false,
    }),
    chunkerOutput = chunker.fiss(output);

  console.log('Write, attach progressBar', chunker.spec);

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

  progressStream.on('complete', bar => bar.end('Complete\n'));
  if (callback) progressStream.on('complete', callback);
  reader.pipe(chunker).pipe(chunkerOutput);
}

function mainMerge(input, output, callback) {
  let size = totalSize(input);
  let inputBlocks = (fs.statSync(input).isDirectory() ? readdir2(input) : [input]).map(file => [
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

function exec(fn, name, callback, ...args) {
  if (!args.every(v => v !== undefined)) throw new Error('Please complete the argument list');
  console.log(`${name}: [${args.join(' -> ')}]`);
  fn(...args, callback ? callback(args) : null);
}

let engine = {
  chunk: [exec, [mainChunk, 'Chunk', ,], [, ,]],
  merge: [exec, [mainMerge, 'Merge', ,], [, ,]],
  _chunk: [exec, [_chunk, 'Chunk, Print Parts', ,], [, , ,]],
  '+': 'chunk',
  '-': 'merge',
  '+-': [exec, [mainChunk, 'Chunk, then Merge', args => folder => mainMerge(folder, args[2])], [, , ,]],
  '+!': '_chunk',
};

function main(_method) {
  let _input,
    method,
    input = process.argv.slice(2);
  if (input[0] in engine) [method, input] = [input[0], input.slice(1)];
  let block = (typeof engine[method] == 'string' ? engine[engine[method]] : engine[method]) || engine[_method];
  _input = [...block[1]];
  _input.push(...Object.assign([], block[2], input));
  block[0].call(null, ..._input);
}

main('chunk');

/**
 * > node splitr [action?=chunk] <input> <output> <?:extra>
 * ================================================
 * > node index chunk ./file ./folder              Chunk a file
 * > node index merge ./folder ./file              Merge chunk streams into one
 * > node index _chunk ./file y y                  Chunk a file, <output=?[y] Print parts to screen> <extra=?[y] Whether or not to show data at all>
 * > node index ./file ./folder                    Alias for <action=chunk>
 * > node index + ./file ./folder                  Alias for <action=chunk>
 * > node index - ./folder ./file                  Alias for <action=merge>
 * > node index +- ./file ./folder ./re-compiled   Chunk a file, merge from the resulting folder
 * > node index +! ./file ./folder                 Alias for <action=_chunk>
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
