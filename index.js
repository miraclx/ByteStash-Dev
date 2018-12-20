let fs = require('fs'),
  tmp = require('tmp'),
  path = require('path'),
  stream = require('stream'),
  crypto = require('crypto'),
  zlib = require('zlib'),
  _ = require('lodash'),
  tar = require('tar-fs'),
  archiver = require('archiver'),
  readlineSync = require('readline-sync'),
  totalSize = require('./libs/total-size'),
  readdir2 = require('./libs/readdir2'),
  parseBytes = require('./libs/parse-bytes'),
  { ReadChunker, ReadMerger } = require('./libs/split-merge'),
  ProgressBar = require('./libs/ProgressBar');

class XMAP {
  constructor(objectSpecs, bufSlots) {
    let _xmap = {
      key: null,
      tag: null,
      type: null,
      size: null,
      input: null,
      chunks: [],
      ...objectSpecs,
    };
    Object.assign(
      this,
      XMAP.parseBuffers({ ..._xmap, chunks: _xmap.chunks.map(chunk => XMAP.parseBuffers({ ...chunk }, bufSlots)) }, bufSlots)
    );
  }
  encode(encoding, bufSlots) {
    return XMAP.parseBuffers(
      { ...this, chunks: this.chunks.map(chunk => XMAP.parseBuffers({ ...chunk }, bufSlots, encoding)) },
      bufSlots,
      encoding
    );
  }
  stringify(encoding = 'hex', JSONSpaces, bufSlots) {
    if (Array.isArray(JSONSpaces)) [JSONSpaces, bufSlots] = [null, JSONSpaces];
    return JSON.stringify(this.encode(encoding, bufSlots), null, JSONSpaces);
  }
  stashChunk(objectSpecs) {
    this.chunks.push({
      iv: null,
      tag: null,
      size: null,
      file: null,
      oldFile: null,
      ...objectSpecs,
    });
  }
  static parse(xmapString, bufSlots) {
    return new XMAP(JSON.parse(xmapString), bufSlots);
  }
  static parseFile(xmapFile, bufSlots) {
    return this.parse(fs.readFileSync(xmapFile).toString(), bufSlots);
  }
  static parseBuffers(object, bufSlots, encoding) {
    if (typeof bufSlots === 'string') [encoding, bufSlots] = [bufSlots, null];
    for (let slot of bufSlots || ['iv', 'tag', 'key', 'salt', 'chunk_key']) {
      if (slot in object && object[slot]) {
        object[slot] = Buffer.from(object[slot], 'hex');
        if (encoding) object[slot] = object[slot].toString(encoding);
      }
    }
    return object;
  }
}

function prepareProgress(size, slots, opts) {
  let progressStream = ProgressBar.stream(size, slots, {
    bar: {
      filler: '=',
      header: 'ue0b0',
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

function encrypt(input, output, callback) {
  let size = totalSize(input);
  if (!fs.statSync(output).isDirectory()) throw Error('Output directory does not exist');

  let reader = fs.createReadStream(input, {
      highWaterMark: 16 ** 4,
    }),
    chunker = new ReadChunker({
      length: 50,
      total: size,
      appendOverflow: false,
    }),
    chunkerOutput = chunker.fiss(output, folder => path.join(folder, crypto.randomBytes(32).toString('hex')) + '.xpart');

  console.log(`ByteStash Encrypt Demo`);
  console.log(`| Input File:       "${input}"`);
  console.log(`| Output Directory: "${output}"`);
  console.log(`| Total Size:       "${parseBytes(chunker.spec.total)}"`);
  let areEqual = parseBytes(chunker.spec.splitSize, 1) == parseBytes(chunker.spec.lastSplitSize, 1);
  console.log(
    `| Number of chunks: "${chunker.spec.numberOfParts - (!areEqual ? 1 : 0)} chunk${
      chunker.spec.numberOfParts !== 1 ? 's' : ''
    } @ ${parseBytes(chunker.spec.splitSize)}${!areEqual ? `, 1 chunk @ ${parseBytes(chunker.spec.lastSplitSize)}` : ''}"`
  );

  let progressStream = prepareProgress(
    size,
    ProgressBar.slotsBySize(
      size,
      [...Array(chunker.spec.numberOfParts)].map(
        (...[, index]) =>
          index + 1 !== chunker.spec.numberOfParts ? chunker.spec.splitSize : chunker.spec.lastSplitSize || chunker.spec.splitSize
      )
    )
  );

  let user_key;
  do {
    if (
      (user_key = readlineSync.question('Please enter the password for encrypting : ', {
        mask: '',
        hideEchoBack: true,
      }))
    ) {
      if (readlineSync.keyInYN('Quit?')) process.exit();
    } else break;
    // eslint-disable-next-line no-constant-condition
  } while (true);

  let dummy = new XMAP({
    key: crypto.randomBytes(32),
    tag: crypto.randomBytes(16),
    type: 'file',
    size,
    input: path.basename(input),
  });

  function getKey(key) {
    let salt = crypto.randomBytes(32);
    return { salt, chunk_key: crypto.pbkdf2Sync(key, salt, 10000, 32, 'sha256') };
  }

  chunker
    .use(
      'cipher',
      ([{ chunkSize: size, finalChunk }, file], persist) => {
        persist.index !== 10
          ? persist.index++
          : ([persist.index, { salt: persist.salt, chunk_key: persist.chunk_key }] = [1, getKey(user_key)]);
        let { salt, chunk_key } = persist;

        let iv = crypto.randomBytes(16),
          cipher = crypto.createCipheriv('aes-256-gcm', chunk_key, iv).once('end', () => {
            dummy.stashChunk({
              iv,
              tag: cipher.getAuthTag(),
              size,
              salt,
              file: path.basename(file),
            });
          });
        if (finalChunk) persist = {};
        return cipher;
      },
      { index: 1, ...getKey(user_key) },
      error => console.log(`An error occurred:\n${error}`)
    )
    .use('progressBar', ([{ chunkSize, _number }, file]) =>
      progressStream.next(chunkSize, {
        _template: { attachedMessage: `[${_number}] Writing to ${file}` },
      })
    );

  progressStream.on('complete', bar => {
    let file = path.join(output, '.xmap'),
      content = dummy.stringify('hex', 0);
    bar.end('Complete\n');
    console.log(`Writing map to ${file}`);
    fs.writeFile(file, content, () => {
      console.log(`Written map: ${parseBytes(content.length)}`);
      if (callback) callback(output);
    });
  });

  return stream.pipeline(reader, chunker, chunkerOutput, err => err && console.error('An error occurred\n' + err));
}

function decrypt(folder, output, callback) {
  if (!fs.statSync(folder).isDirectory()) throw Error('Input file must be an existing directory');

  let _xmap = path.join(folder, '.xmap');
  if (!fs.existsSync(_xmap)) throw Error('Unable to locate and parse xmap file');

  let xmap = XMAP.parseFile(_xmap),
    inputBlocks = xmap.chunks.map(({ iv, tag, size, salt, file }) => [
      { iv, tag, size, salt, file },
      fs.createReadStream(path.join(folder, file)),
    ]),
    merger = new ReadMerger(),
    mergeStash = merger.fuse(...inputBlocks);

  console.log(`ByteStash Decrypt Demo`);
  console.log(`| Input Folder:     "${folder}"`);
  console.log(`| Output File:      "${output}"`);
  console.log(`| Total Size:       "${parseBytes(xmap.size)}"`);
  console.log(`| Number of chunks: "${xmap.chunks.length}"`);

  let progressStream = prepareProgress(xmap.size, ProgressBar.slotsBySize(xmap.size, inputBlocks.map(block => block[0].size))).on(
    'complete',
    bar => {
      bar.end('Complete\n');
      if (callback) callback(output);
    }
  );

  let user_key;
  do {
    if (
      (user_key = readlineSync.question('Please enter the password for decrypting : ', {
        mask: '',
        hideEchoBack: true,
      }))
    ) {
      if (readlineSync.keyInYN('Quit?')) process.exit();
    } else break;
    // eslint-disable-next-line no-constant-condition
  } while (true);

  merger
    .use(
      'decipher',
      ([{ iv, tag, salt }], persist) => {
        let chunk_key;
        if (persist.tag !== tag) {
          persist.tag = tag;
          chunk_key = crypto.pbkdf2Sync(user_key, salt, 10000, 32, 'sha256');
        }
        return crypto.createDecipheriv('aes-256-gcm', chunk_key, iv).setAuthTag(tag);
      },
      {},
      error => console.log(`An error occurred:\n${error}`)
    )
    .use('progressBar', ([{ size, file }], _persist) =>
      progressStream.next(size, {
        _template: { attachedMessage: `Writing from ${file}` },
      })
    );

  progressStream.on('complete', bar => {
    bar.end('Decipher Complete\n');
    if (callback) callback(output);
  });

  return stream.pipeline(mergeStash, merger, fs.createWriteStream(output));
}

function prepWorkSpace(notHome) {
  let os = require('os');

  let tmp = os.tmpdir(),
    home = os.homedir(),
    cache,
    folder,
    folderName = '.bytestash';

  try {
    if (home && !notHome) folder = path.join(home, folderName);
    else if (tmp) folder = path.join(tmp, folderName);
    else folder = path.join(process.cwd(), folderName);
    cache = path.join(folder, '.cache');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder);
    if (!fs.existsSync(cache)) fs.mkdirSync(cache);
  } catch {
    throw new Error('Unable to create a working directory');
  }
  return { main: folder, cache };
}

function _encrypt(folder, output, callback) {
  let allSize = _.flattenDeep(totalSize.getFolderContentSizes(folder)),
    size = allSize.reduce((a, b) => a + b, 0);

  let progressGen = ProgressBar.stream(size, ProgressBar.slotsBySize(size, allSize));

  let { cache } = prepWorkSpace(!true);

  let tmpPath = tmp.fileSync({ prefix: 'byteX-', postfix: '.tar', dir: cache });

  let pack,
    writer = fs.createWriteStream(tmpPath.name);

  pack = tar
    .pack(folder, {
      mapStream(fStream, header) {
        return fStream.pipe(progressGen.next(header.size));
      },
    })
    .pipe(zlib.createGzip());

  pack.once('finish', () => {
    writer.once('close', () => {
      progressGen.bar.end('Compiled!, %d => %d\n', ...[size, writer.bytesWritten].map(val => parseBytes(val)));

      if (callback) callback(tmpPath.name, output).on('finish', () => tmpPath.removeCallback());
      else tmpPath.removeCallback();
    });
  });

  pack.pipe(writer);
}

function exec(fn, name, callback, ...args) {
  if (!args.every(v => v !== undefined)) throw new Error('Please complete the argument list');
  console.log(`${name}: [${args.join(' -> ')}]`);
  fn(args[0], args[1], callback ? callback(args) : null);
}

let engine = {
  '+': 'ccrypt',
  '-': 'dmerge',
  ccrypt: [exec, [encrypt, 'Chunk, Encrypt', ,], [, ,]],
  _ccrypt: [exec, [_encrypt, 'Compile and Compress then Chunk while encrypting each', () => encrypt], [, ,]],
  dmerge: [exec, [decrypt, 'Decrypt, Merge', ,], [, ,]],
  '+-': [exec, [encrypt, '(Chunk, Encrypt) then (Decrypt, Merge)', args => folder => decrypt(folder, args[2])], [, , ,]],
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

main('ccrypt');

/**
 * > node index [action?=encrypt] <input> <output> <?:extra>
 * ================================================
 * > node index encrypt ./file ./folder            Chunk a file, encrypting each chunk
 * > node index decrypt ./folder ./file            Merge decrypted chunk streams into one
 * > node index ./file ./folder                    Alias for <action=encrypt>
 * > node index + ./file ./folder                  Alias for <action=encrypt>
 * > node index - ./folder ./file                  Alias for <action=decrypt>
 * > node index +- ./file ./folder ./re-compiled   Chunk and encrypt a file, decrypt and merge from the resulting folder
 */

/**
 * Create block image
 * Write encryption key to xmap file
 * Split
 *  | Encrypt
 *  | Write salt, iv, tag, file, size to xmap chunk
 * Write encrypted, stringified xmap file
 * ?: Compile a tarball of chunked files
 *
 * Extract tarball, collect streams of entries
 * Merge
 *  | Decrypt with salt, iv, tag
 * Decrypt merge
 * Decompile from resulting tarball
 */

/**
 * MergeStash { files }
 *   .pipe(merger.use('entry', pack.entry('file')))
 *   .pipe(fs.createWriteStream(file));
 */
