let _ = require('lodash'),
  { ReadChunker, ReadMerger, WriteAttacher } = require('../libs/split-merge'),
  ProgressBar = require('../libs/ProgressBar'),
  readdirSync = require('../libs/path-readdir');

function generateBarStream(label, size, slots) {
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
    }),
    { bar } = progressStream;
  bar.label(label);
  return progressStream;
}

function runChunkify(inputFile, outputFiles) {
  let chunker = new ReadChunker({
    length: 50,
    // size: 1 * 10 ** 6,
    // size: 5 * 2 ** 20,
  });

  let slots = chunker.specs.percentage();
  let progressStream = generateBarStream('Chunker', chunker.specs.totalSize, slots),
    { bar } = progressStream;
  let chunkerOutput = new WriteAttacher()
    .use('barStream', (size, file, persist) =>
      progressStream.next(size, {
        _template: {
          attachedMessage: `|${(persist.index = persist.index + 1 || 1)}| Writing to output file ${file}`,
        },
      })
    )
    .on('done', () => {})
    .on('finish', () => bar.end('Chunk successful\n'))
    .on('error', () => bar.end('An error occurred\n'));

  chunker.pipe(chunkerOutput);
}

function runMergify(inputFiles, outputFile) {
  // Let array of info be when writing content so it doesnt clog the RAM for large chunks
  let merger = new ReadMerger(inputFiles, outputFile);
  let slots = merger.specs.percentage();
  let progressStream = generateBarStream('Merger', merger.specs.totalSize, slots),
    { bar } = progressStream;
  let mergerOutput = new WriteAttacher()
    .use('barStream', (size, file, persist) =>
      progressStream.next(size, {
        _template: {
          attachedMessage: `|${(persist.index = persist.index + 1 || 1)}| Merging from input file ${file}`,
        },
      })
    )
    .on('done', () => {})
    .on('finish', () => bar.end('Merge successful\n'))
    .on('error', err => {
      if (!bar.isFresh) bar.end('An error occurred\n');
      else throw Error(err);
    });

  merger.pipe(mergerOutput);
}

let engine = {
  chunk: [runChunkify, ['./resource/big_file.txt', './test.dir/heap/file%{numberPad%}-%{nParts%}.part']],
  merge: [
    (input, output) => {
      let fs = require('fs'),
        path = require('path');
      runMergify(
        _.flattenDeep(
          input.split(',').map(file => {
            const stat = fs.statSync(file);
            return stat.isDirectory()
              ? readdirSync(file)
              : stat.isFile() && file.endsWith('.json')
                ? require(path.join(process.cwd(), file)).map(_file => path.join(process.cwd(), path.parse(file).dir, _file))
                : file;
          })
        ),
        output
      );
    },
    ['./test.dir/heap', './test.dir/merged.result'],
  ],
};

function main(method) {
  let input = process.argv.slice(2);
  if (input[0] in engine) [method, input] = [input[0], input.slice(1)];
  input = Object.assign([], engine[method][1], input);
  console.log(method, JSON.stringify(input));
  engine[method][0].call(null, ...input);
}

main('chunk');

// chunker.pipe(chunkerOutput);
// fs.createReadStream(file).pipe(chunker).pipe(chunkerOutput);
// archiver.pipe(crypto).pipe(chunker).pipe(chunkerOutput.use('encrypt', (file, size, persist) => {}));

/**
 *
 */
