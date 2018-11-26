const fs = require('fs'),
  {ReadChunker, WriteChunker, ReadMerger, WriteMerger} = require('../libs/split-merge'),
  parseRatio = require('../libs/parse-ratio'),
  ProgressBar = require('../libs/ProgressBar'),
  readdirSync = require('../libs/path-readdir');

function spec() {
  // Specify a file[A]
  // Get an input stream of file[A]
  // Specify output files[...B]
  // Create a chunker[C] from library
  // Create a progressbar stream generator[D]
  // Tweak chunker options and set output to files[B]
  // |- Create write streams into files[B] with future content snipped from file[A]
  // Pipe the file[A] into progressbar [E] generated from [D] and then into chunker[C]
  // |- Start writing based on configuration to files[B]
}

function generateBarStream(label, size, slots, append = true) {
  let progressStream = ProgressBar.stream(size, slots, {
      // length: 100,
      bar: {
        blank: '-',
        filler: '=',
        header: '>',
        color: ['bgRed', 'white'],
        // color: ['bgWhite', 'red'],
      },
      forceFirst: true,
      template: [
        '%{label%}: |%{slot:bar%}| %{_percentage%}% %{_eta%}s [%{slot:size%}/%{slot:size:total%}]',
        '%{_label%}:%{_bar%} %{__percentage%}% %{__eta%}s [%{size%}/%{size:total%}]',
      ],
      _template: {
        _label: 'Total',
        _percentage(feats) {
          return `${feats['slot:percentage']}`.padStart(3, ' ');
        },
        __percentage({percentage}) {
          return `${percentage}`.padStart(3, ' ');
        },
        _eta(feats) {
          return `${feats['slot:eta']}`.padStart(3, ' ');
        },
        __eta({eta}) {
          return `${eta}`.padStart(3, ' ');
        },
        _bar({bar}) {
          return `${bar ? `   [${bar}]` : ''}`;
        },
      },
    }),
    {bar} = progressStream;
  bar.label(label);

  return progressStream;
}

function runChunkify() {
  let chunker = new ReadChunker('./resource/gifted.zip', './test.dir/heap/file%{numberPad%}-%{nParts%}.zip.part', {
    // length: 100000,
    size: 10 ** 7,
  });

  console.log(`Input file: ${chunker.prefs.file.path}`);

  let slots = chunker.specs.percentage();
  let progressStream = generateBarStream('Chunker', chunker.prefs.file.stat.size, slots),
    {bar} = progressStream;
  // process.exit(console.log(bar));
  let chunkerOutput = new WriteChunker()
    .attach('barStream', (size, outputFile, persist) => {
      let barStream = progressStream.next(size),
        {bar} = barStream;
      // bar.print(`|${(persist.index = persist.index + 1 || 1)}| Writing to output file ${outputFile}`);
      return barStream;
    })
    .on('done', () => {})
    .on('finish', () => {
      bar.end('All successful\n');
    })
    .on('error', () => bar.end('An error occurred\n'));

  chunker.pipe(chunkerOutput);
}

function runMergify() {
  // Let array of info be when writing content so it doesnt clog the RAM for large chunks
  let merger = new ReadMerger(readdirSync('./test.dir/heap'), './test.dir/complete.txt');
  // console.log(merger);
}

// runChunkify();
runMergify();
