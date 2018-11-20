const fs = require('fs'),
  {ReadChunker, WriteChunker} = require('../libs/chunk-file'),
  parseRatio = require('../libs/parse-ratio'),
  ProgressBar = require('../libs/ProgressBarArr');

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

function runChunkify() {
  let chunker = new ReadChunker('./resource/big_file.txt', './test.dir/heap/file%{numberPad%}-%{nParts%}.zip.part', {
    // length: 20,
    size: 5 * 10 ** 4,
  });
  // process.exit(console.log(chunker));

  let progressStream = ProgressBar.stream(chunker.prefs.file.stat.size, chunker.specs.percentage(), {
      template: 'Current: |%{slot:bar%}| %{slot:percentage%}% %{slot:eta%}s [%{slot:size%}/%{slot:size:total%}]',
      clean: false,
      length: 100,
      bar: {
        splitter: '',
        blank: '-',
        filler: '=',
        colors: ['bgRed', 'green'],
      },
    }),
    {bar} = progressStream;

  bar.append(
    new ProgressBar(chunker.prefs.file.stat.size, chunker.specs.percentage(), {
      length: 100,
      bar: {
        blank: '=',
        filler: '=',
        header: '>',
      },
      template: '%{label%}:   [%{bar%}] %{percentage%}% %{eta%}s [%{size%}/%{size:total%}]',
    }).label('Total'),
    true
  );
  console.log(`Input file: ${chunker.prefs.file.path}`);
  let chunkerOutput = new WriteChunker()
    // .attach(({inputStream: stream, size, outputFile}) => {
    // let barStream = progressStream.next(size),
    // {bar} = barStream;
    // bar.print(`Writing to output file ${outputFile}`);
    // return stream.pipe(barStream);
    // })
    .attach(({inputStream: stream}) =>
      stream.pipe(
        require('through2')(function(v, e, c) {
          c(null, v);
        })
      )
    );
  chunker.pipe(chunkerOutput).on('complete', () => {
    bar.end('All successful\n');
  });
}

runChunkify();
