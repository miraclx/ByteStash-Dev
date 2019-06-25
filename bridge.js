let fs = require('fs'),
  path = require('path'),
  crypto = require('crypto'),
  { flattenDeep } = require('lodash'),
  xbytes = require('xbytes'),
  ninjaQuery = require('ninja_query'),
  // CORE SCRIPTS
  { compile, decompile, prepWorkSpace } = require('./engine'),
  { commander, argParser, attachCommands, defaultCliHandles } = require('./cli'),
  // SELF LIBRARIES
  { XMAP } = require('./libs/xmap'),
  readdir2 = require('./libs/readdir2'),
  totalSize = require('./libs/total-size'),
  // LIVE LIBS
  ProgressBar = require('xprogress'),
  { ReadChunker, ReadMerger } = require('split-merge');

function passwordQuery(query, confirm = true) {
  return ninjaQuery.password(
    { name: 'password', message: query, mask: '*' },
    {
      confirm,
      confirmMessage: 'Re-enter to confirm :',
      unmatchMessage: "\x1b[33m[!]\x1b[0m Passwords don't match",
    }
  );
}

module.exports = {
  passwordQuery,
  initCli(argv, variables, handles) {
    if (!argv.slice(2).length) commander.outputHelp();
    let stack = { variables };
    for (let [action, handle] of Object.entries({
      ...defaultCliHandles,
      ...handles,
    }))
      stack[action] = (data, ...rest) =>
        (handle || defaultCliHandles[action] || defaultCliHandles['*'].bind(null, action)).call(
          null,
          data,
          ...rest.slice(0, -1),
          [argParser['main'], argParser[action] || argParser['*']].reduce((stack, fn) => ({ ...stack, ...fn(data, ...rest) }), {})
        );
    attachCommands(commander, stack).parse(argv);
  },
  getMap(dir) {
    function isDir(p) {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    }
    return flattenDeep(readdir2(dir).map(v => (isDir(v) ? [v, ...this.getMap(v)] : v)));
  },
  core: {
    encrypt(folder, options) {
      let { cache } = prepWorkSpace(),
        size = totalSize(folder);
      if (options.stream && options.chunks | 0)
        console.error('\x1b[33m[!]\x1b[0m `-c <num>` is incompatible with `-s`...resolving to infinite chunks');

      if (!(options.groupBy | 0) || options.groupBy > options.chunks)
        console.warn(
          `\x1b[33m[!]\x1b[0m \`-g <num>\` must start from 1 and be contained within chunk quantity, falling back to 5`
        ),
          (options.groupBy = 5);

      function processEncrypt(userInputKey) {
        let progressGen = ProgressBar.stream(size, Infinity, {
            ...(options.stream ? { pulsate: true } : {}),
            template: [':{progressID}[:{flipper}] :{actionMsg}', ' [\u2022] :{slot:bar}', ' [+] :{action:bar}'],
            variables: {
              size: ({ size, transferred, completed }) => (completed ? size : transferred),
              prepend: ({ action }) => `${action == 'chunk' ? `(:{_number}${!options.stream ? '/:{_total}' : ''})` : ''}`,
              progressID: ({ action }) => `${!options.stream ? `(${action == 'compile' ? 1 : 2}/2) ` : ''}`,
              ['slot:bar']: ({ action }) =>
                `:{prepend}|:{slot:bar}| [:{slot:eta}] [:3{slot:percentage}%] ${
                  action == 'chunk' ? '[:{slot:size}/:{slot:size:total}] [:{slot:eta}]' : ''
                }`,
              ['action:bar']: () => `:{prepend}[:{bar}] :{size}:{size:total}`,
              ['size:total']: () => (!options.stream ? `/:{size:total} [:{eta}]` : ''),
            },
          }),
          { bar } = progressGen;
        let stack = fs.statSync(folder).isDirectory();
        compile(
          folder,
          {
            size,
            stack,
            direct: options.stream,
            cacheDir: cache,
            compressID: options.compressID,
            progressGen,
          },
          (stream, total) => {
            function getKeyData(key) {
              let salt = crypto.randomBytes(32);
              return { salt, chunk_key: crypto.pbkdf2Sync(key, salt, 10000, 32, 'sha256') };
            }
            bar.drain().total(total || bar.total());
            let xmap = new XMAP({
                key: crypto.randomBytes(32),
                tag: crypto.randomBytes(16),
                size,
                type: stack ? 'folder' : 'object',
                compress: { id: options.compressID, size: total },
              }),
              chunker = new ReadChunker({
                ...(total | 0 && {
                  size: options.bytes,
                  total,
                  length: options.chunks,
                  appendOverflow: true,
                }),
              })
                .use(
                  'cipher',
                  ([{ chunkSize, finalChunk }, file], persist) => {
                    (persist.index = persist.index || options.groupBy) !== options.groupBy
                      ? persist.index++
                      : ([persist.index, { salt: persist.salt, chunk_key: persist.chunk_key }] = [1, getKeyData(userInputKey)]);

                    let { salt, chunk_key } = persist,
                      iv = crypto.randomBytes(16),
                      cipher = crypto.createCipheriv('aes-256-gcm', chunk_key, iv).once('end', () => {
                        xmap.stashChunk({
                          iv,
                          tag: cipher.getAuthTag(),
                          file: path.basename(file),
                          salt,
                          size: chunkSize,
                        });
                      });
                    return finalChunk && (persist = {}), cipher;
                  },
                  error => error && console.log(`An error occurred while chunking:\n${error}`)
                )
                .use('progressBar', ([{ chunkSize, _number, total }, file]) =>
                  progressGen.next(chunkSize, {
                    variables: {
                      _number,
                      _total: total,
                      action: 'chunk',
                      actionMsg: `Chunking: ${path.basename(file)}`,
                    },
                  })
                ),
              chunkerOutput = chunker.fiss(
                options.out,
                folder => path.join(folder, crypto.randomBytes(32).toString('hex')) + '.xpart'
              );
            if (!fs.existsSync(options.out)) fs.mkdirSync(options.out);
            function complete() {
              bar.end(
                `Test Stash Execution Complete!\nCompressed percentage: ${(100 - (xmap.compress.size / xmap.size) * 100).toFixed(
                  2
                )}% [${xbytes(xmap.size)} => ${xbytes(xmap.compress.size)}]\n`
              );
              let output_file = path.join(options.out, '.xmap'),
                content = Buffer.from(xmap.stringify('hex', 2));
              console.log(`Writing map to ${output_file}`);
              fs.writeFileSync(output_file, content);
              console.log('Written map!');
            }
            return stream
              .pipe(chunker)
              .pipe(chunkerOutput)
              .on('finish', () => (total | 0 ? progressGen.on('complete', complete) : complete()));
          }
        );
      }

      options.key
        ? processEncrypt(options.key)
        : passwordQuery('Please enter the password for encrypting :').then(({ password }) => processEncrypt(password));
    },
    decrypt(folder, options) {
      if (!fs.statSync(folder).isDirectory()) throw Error(`[${folder}] must be an existent file or directory stash`);
      let _xmap = path.join(folder, '.xmap');
      if (!fs.existsSync(_xmap)) throw Error('Unable to locate and parse xmap file');

      function processDecrypt(userInputKey) {
        let xmap = XMAP.parseFile(_xmap),
          inputBlocks = xmap.chunks.map(({ iv, tag, size, salt, file }, index) => [
            { iv, tag, size, salt, file, index },
            fs.createReadStream(path.join(folder, file)),
          ]),
          merger = new ReadMerger(),
          { cache } = prepWorkSpace(),
          mergeStash = merger.fuse(...inputBlocks),
          progressGen = ProgressBar.stream(xmap.compress.size, xmap.chunks.map(v => v.size), {
            forceFirst: xmap.chunks.length > 20,
            bar: {
              separator: '|',
            },
            variables: { ['chunk:total']: xmap.chunks.length },
            template: [
              '(:{chunk:number}/:{chunk:total}): :{chunk:file}',
              ' Decrypting: ":{file}" [:{flipper}]',
              ' [\u2022] |:{slot:bar}| [:3{slot:percentage}%] :{slot:eta} [:{slot:size}/:{slot:size:total}]',
              ' [+] [:{bar}] [:3{percentage}%] :{eta} [:{size}/:{size:total}]',
            ],
          }).on('complete', () => progressGen.bar.end('Decryption complete!\n'));
        merger
          .use('decipher', ([{ iv, tag, salt }], persist) => {
            let chunk_key;
            if (persist.tag !== tag) [persist.tag, chunk_key] = [tag, crypto.pbkdf2Sync(userInputKey, salt, 10000, 32, 'sha256')];
            return crypto.createDecipheriv('aes-256-gcm', chunk_key, iv).setAuthTag(tag);
          })
          .use('progressBar', ([{ size, file, index }]) =>
            progressGen.next(size, {
              variables: {
                ['chunk:file']: file,
                ['chunk:number']: index + 1,
              },
            })
          );
        decompile(
          mergeStash.pipe(merger),
          process.stdout.isTTY ? options.out : process.stdout,
          { stack: xmap.type == 'folder', cacheDir: cache, compressID: xmap.compress.id, progressGen },
          err => (err ? progressGen.bar.print(`An error occurred:\n${err}`) : progressGen.bar.print('Success'))
        );
      }

      options.key
        ? processDecrypt(options.key)
        : passwordQuery('Please enter the password for decrypting :', false).then(({ password }) => processDecrypt(password));
    },
    cachemgr({ clean, humanReadable }) {
      let { cache } = prepWorkSpace();
      function printCacheData() {
        console.log(`Cache location: ${cache}`);
        console.log(`Cache size: ${(humanReadable ? xbytes : v => v)(totalSize(cache))}`);
      }
      printCacheData();
      let files = null;
      if (clean && (files = module.exports.getMap(cache)).length) {
        console.log('Removing...');
        for (let [index, file] of Object.entries(files))
          console.log(
            ` [\u2022] (${`${+index + 1}`.padStart(`${files.length}`.length, ' ')}) ${path.basename(file)} @ ${(humanReadable
              ? xbytes
              : v => v)(totalSize(file))}`
          ),
            fs.unlinkSync(file);
        console.log('Rebuilding cache...');
        prepWorkSpace();
        printCacheData();
      }
    },
    clean(folder, opts) {
      if (!fs.statSync(folder).isDirectory()) throw Error(`[${folder}] must be an existent file or directory stash`);
      let _xmap = path.join(folder, '.xmap');
      if (!fs.existsSync(_xmap)) throw Error('Unable to locate and parse xmap file');
      function processClean() {
        let xmap = XMAP.parseFile(_xmap);
        let legitFiles = xmap.chunks.map(v => v.file);
        let uselessFiles = readdir2(folder)
          .filter(file => path.basename(file) !== '.xmap')
          .filter(content => !legitFiles.includes(path.basename(content)))
          .map(file => ({ file, name: path.basename(file), size: fs.statSync(file).size }));
        if (uselessFiles.length === 0) return console.log(`\x1b[31m[!]\x1b[0m No extraneous files to clean!`);
        let parseByte = size => (opts.humanReadable ? xbytes(size) : size);
        function processRemove(uselessFiles) {
          uselessFiles.forEach(({ file, size }) => {
            let failed = false;
            if (opts.verboseLevel) process.stdout.write(`[\u2022] ${file} @ ${parseByte(size)}...`);
            try {
              if (fs.statSync(file).isDirectory()) fs.rmdirSync(file);
              else fs.unlinkSync(file);
            } catch {
              failed = true;
            }
            if (opts.verboseLevel && !failed) process.stdout.write(fs.existsSync(file) ? 'failed\n' : `done\n`);
          });
        }
        if (opts.interractive)
          ninjaQuery(
            ninjaQuery.extend(
              'confirm',
              uselessFiles.map(({ name, size }, index) => ({
                name: `${index}`,
                message: `Remove [${name}]`,
                suffix: ` @ ${parseByte(size)}`,
              }))
            )
          ).then(results =>
            processRemove(
              Object.entries(results).reduce((arr, [index, remove]) => (remove && arr.push(uselessFiles[index]), arr), [])
            )
          );
        else processRemove(uselessFiles);
      }
      // processClean();
      passwordQuery('Please enter the password for stash :', false).then(({ password }) => processClean(password));
    },
  },
};
