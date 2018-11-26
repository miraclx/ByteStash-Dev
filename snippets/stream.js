let {createReadStream, statSync, createWriteStream} = require('fs'),
  Promise = require('bluebird'),
  ProgressBar = require('../libs/ProgressBar'),
  parseBytes = require('../libs/parse-bytes'),
  totalSize = require('../libs/total-size');

function runExample(files, showLog = true) {
  var [fileSizes, inSizes, allSize] = files.reduce(
    (stack, block) => (
      (stack[0].push(totalSize(block.in)), (stack[1] += stack[0][stack[0].length - 1])),
      (stack[2] += stack[0][stack[0].length - 1] * block.out.length),
      stack
    ),
    [[], 0, 0]
  );
  var [inputFiles, outputFiles, slots] = files.reduce(
    (o, block, index) => (
      o[0].push(block.in), o[1].push(...block.out), o[2].push(...block.out.map(() => (fileSizes[index] / allSize) * 100)), o
    ),
    [[], [], []]
  );

  var progressBars = ProgressBar.stream(allSize, slots, {
    template: 'Current: |%{slot:bar%}| %{slot:percentage%}% %{slot:eta%}s [%{slot:size%}/%{slot:size:total%}]',
    clean: false,
    bar: {
      splitter: '',
      blank: '-',
      filler: '=',
      color: ['yellow', 'bgRed'],
    },
  });

  progressBars.bar.append(
    new ProgressBar(allSize, slots, {
      bar: {
        blank: '=',
        filler: '=',
        separator: '|',
        header: '>',
        color: ['bgBlue', 'magenta'],
      },
      forceFirst: true,
      template: '%{label%}:   [%{bar%}] %{percentage%}% %{eta%}s [%{size%}/%{size:total%}]',
    }).label('Total'),
    true
  );

  console.log(`Input Files: ${inputFiles.length} @ ${parseBytes(inSizes)}`);
  console.log(`Output Files: ${outputFiles.length} @ ${parseBytes(allSize)}`);

  return Promise.mapSeries(
    files,
    (block, bIndex) =>
      new Promise((resolve, reject) => {
        bIndex += 1;
        if (showLog) progressBars.bar.print(`[${bIndex}] Starting copy from ${block.in}`);
        Promise.mapSeries(
          block.out,
          (result, rIndex) =>
            new Promise((resolve, reject) => {
              rIndex += 1;
              var reader = createReadStream(block.in);
              reader
                .pipe(
                  progressBars
                    .next(statSync(reader.path).size, {_template: {in: block.in, out: result}})
                    .on('complete', () => resolve(result))
                    .on('error', reject)
                )
                .pipe(createWriteStream(result));
            })
        )
          .then(resolve)
          .catch(reject);
      })
  )
    .then(() => progressBars.bar.end('Ended copy!\n'))
    .catch(error => progressBars.bar.end('An error occurred\n'));
}

runExample([
  {
    in: './resource/big_file.txt',
    out: [...Array(2)].map((...[, i]) => `./test.dir/chunks/season-part-${i}`),
  },
]);
