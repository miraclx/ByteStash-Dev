let fs = require('fs'),
  path = require('path'),
  crypto = require('crypto'),
  { question, keyInYN } = require('readline-sync'),
  { flattenDeep } = require('lodash'),
  { XMAP } = require('./libs/xmap'),
  { compile, decompile, prepWorkSpace } = require('./engine'),
  { commander, argParser, attachCommands, defaultCliHandles } = require('./cli'),
  readdir2 = require('./libs/readdir2'),
  totalSize = require('./libs/total-size'),
  ProgressBar = require('./libs/progress2'),
  parseTemplate = require('./libs/parse-template'),
  { ReadChunker, ReadMerger } = require('./libs/split-merge');

function persistentQuery(query) {
  let user_key;
  do {
    if (!(user_key = question(query, { mask: '', hideEchoBack: true }))) keyInYN('Quit?') && process.exit();
    else break;
    // eslint-disable-next-line no-constant-condition
  } while (true);
  return user_key;
}

module.exports = {
  parseTemplate,
  profile: {
    createUser() {},
    stashManager() {},
    getUserDetails() {},
  },
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
        console.warn(`\x1b[33m[!]\x1b[0m \`-g <num>\` must start from 1, falling back to 5`), (options.groupBy = 5);

      const userInputKey = options.key || persistentQuery('Please enter the password for encrypting : ');

      let progressGen = ProgressBar.stream(size, Infinity, {
          ...(options.stream ? { pulsate: true } : {}),
          template: [':{progressID}[:{flipper}] :{actionMsg}', ' [\u2022] :{slot:bar}', ' [+] :{action:bar}'],
          variables: {
            size: ({ size, transferred, average: { completed } }) => (completed ? size : transferred),
            prepend: ({ action }) => `${action == 'chunk' ? `(:{_number}${!options.stream ? '/:{_total}' : ''})` : ''}`,
            progressID: ({ action }) => `${!options.stream ? `(${action == 'compile' ? 1 : 2}/2) ` : ''}`,
            ['slot:bar']: ({ action }) =>
              `:{prepend}|:{slot:bar}| [:2{slot:eta}s] [:3{slot:percentage}%] ${
                action == 'chunk' ? '[:{slot:size}/:{slot:size:total}]' : ''
              }`,
            ['action:bar']: () => `:{prepend}[:{bar}] :{size}:{size:total}`,
            ['size:total']: () => (!options.stream ? `/:{size:total} [:2{eta}s]` : ''),
          },
        }),
        { bar } = progressGen;

      compile(
        folder,
        {
          size,
          stack: fs.statSync(folder).isDirectory(),
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
              type: 'folder',
              compress: { id: options.compressID, size: total },
            }),
            chunker = new ReadChunker({
              size: options.bytes,
              ...(total | 0 && {
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
            bar.end('Test Stash Execution Complete!\n');
            let output_file = path.join(options.out, '.xmap'),
              content = xmap.stringify('hex', 2);
            console.log(`Writing map to ${output_file}`);
            fs.writeFile(output_file, content, () => console.log(`Written map!`));
          }
          return stream
            .pipe(chunker)
            .pipe(chunkerOutput)
            .on('finish', () => {
              if (total | 0) progressGen.on('complete', complete);
              else complete();
            });
        }
      );
    },
    decrypt(folder, options) {
      if (!fs.statSync(folder).isDirectory()) throw Error(`[${folder}] must be an existent file or directory stash`);
      let _xmap = path.join(folder, '.xmap');
      if (!fs.existsSync(_xmap)) throw Error('Unable to locate and parse xmap file');

      const userInputKey = options.key || persistentQuery('Please enter the password for encrypting : ');

      let xmap = XMAP.parseFile(_xmap),
        inputBlocks = xmap.chunks.map(({ iv, tag, size, salt, file }, index) => [
          { iv, tag, size, salt, file, index },
          fs.createReadStream(path.join(folder, file)),
        ]),
        merger = new ReadMerger(),
        { cache } = prepWorkSpace(),
        mergeStash = merger.fuse(...inputBlocks),
        progressGen = ProgressBar.stream(xmap.size, Infinity, {
          variables: { ['chunk:total']: xmap.chunks.length },
          template: [
            '(:{chunk:number}/:{chunk:total}): :{chunk:file}',
            ' Decrypting: ":{file}" [:{flipper}]',
            ' [\u2022] |:{slot:bar}| [:3{slot:percentage}%] :{slot:eta}s [:{slot:size}/:{slot:size:total}]',
            ' [+] [:{bar}] [:3{percentage}%] :{eta}s [:{size}/:{size:total}]',
          ],
        });
      merger.fuse();
      merger.use('decipher', ([{ iv, tag, salt, file, index }], persist) => {
        progressGen.bar.opts.variables['chunk:file'] = file;
        progressGen.bar.opts.variables['chunk:number'] = index + 1;

        let chunk_key;
        if (persist.tag !== tag) [persist.tag, chunk_key] = [tag, crypto.pbkdf2Sync(userInputKey, salt, 10000, 32, 'sha256')];
        return crypto.createDecipheriv('aes-256-gcm', chunk_key, iv).setAuthTag(tag);
      });

      decompile(
        mergeStash.pipe(merger),
        options.out,
        { size: xmap.size, stack: xmap.type == 'folder', cacheDir: cache, compressID: xmap.compress.id, progressGen },
        err => (err ? console.error(`An error occurred:\n${err}`) : console.log('Success'))
      );
    },
  },
};
