let fs = require('fs'),
  path = require('path'),
  stream = require('stream'),
  crypto = require('crypto'),
  archiver = require('archiver'),
  readlineSync = require('readline-sync'),
  totalSize = require('./libs/total-size'),
  parseBytes = require('./libs/parse-bytes'),
  { ReadChunker, ReadMerger } = require('./libs/split-merge'),
  ProgressBar = require('./libs/ProgressBar');

class XMAP {
  constructor(objectSpecs, bufSlots) {
    let _xmap = {
      ...{ iv: null, tag: null, key: null, salt: null, file: null, size: null, chunks: [] },
      ...objectSpecs,
    };
    Object.assign(
      this,
      XMAP.parseBuffers({ ..._xmap, chunks: _xmap.chunks.map(chunk => XMAP.parseBuffers({ ...chunk }, bufSlots)) }, bufSlots)
    );
  }
  encode(encoding, bufSlots) {
    return {
      ...XMAP.parseBuffers(
        { ...this, chunks: this.chunks.map(chunk => XMAP.parseBuffers({ ...chunk }, bufSlots, encoding)) },
        bufSlots,
        encoding
      ),
    };
  }
  stringify(encoding = 'hex', bufSlots) {
    return JSON.stringify(this.encode(encoding, bufSlots));
  }
  stashChunk(objectSpecs) {
    this.chunks.push({ ...{ iv: null, tag: null, size: null, file: null, oldFile: null }, ...objectSpecs });
  }
  static parse(xmapString, bufSlots) {
    return new XMAP(JSON.parse(xmapString), bufSlots);
  }
  static parseFile(xmapFile, bufSlots) {
    return this.parse(fs.readFileSync(xmapFile).toString(), bufSlots);
  }
  static parseBuffers(object, bufSlots, encoding) {
    if (typeof bufSlots === 'string') [encoding, bufSlots] = [bufSlots, null];
    for (let slot of bufSlots || ['iv', 'tag', 'key', 'salt']) {
      if (slot in object && object[slot]) {
        object[slot] = Buffer.from(object[slot], 'hex');
        if (encoding) object[slot] = object[slot].toString(encoding);
      }
    }
    return object;
  }
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
      '%{label%}|%{slot:bar%}| %{_percentage%}% %{_eta%}s [%{slot:size%}/%{slot:size:total%}]',
      'Total:%{bar%} %{__percentage%}% %{eta%}s [%{size%}/%{size:total%}]',
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
      __percentage({ percentage }) {
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

function encryptFolder(input, output, callback) {
  let size = totalSize(input);

  let reader = fs.createReadStream(input, {
      highWaterMark: 16 ** 4,
    }),
    chunker = new ReadChunker({
      // size: 10 * 10 ** 6,
      length: 50,
      total: size,
      appendOverflow: false,
    }),
    chunkerOutput = chunker.fiss(
      output,
      file => path.join(path.dirname(file), crypto.randomBytes(32).toString('hex')) + '.xpart'
    );

  console.log(`ByteStash Encrypt Demo`);
  console.log(` | Input File:       "${input}"`);
  console.log(` | Output Directory: "${path.dirname(output)}"`);
  console.log(` | Total Size:       "${parseBytes(chunker.spec.total)}"`);
  let areEqual = parseBytes(chunker.spec.splitSize, 1) == parseBytes(chunker.spec.lastSplitSize, 1);
  console.log(
    ` | Number of chunks: "${chunker.spec.numberOfParts - (!areEqual ? 1 : 0)} files @ ${parseBytes(chunker.spec.splitSize)}${
      !areEqual ? `, 1 chunk @ ${parseBytes(chunker.spec.lastSplitSize)}` : ''
    }"`
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

  let salt = Buffer.from('bytestash@internals:_test_debug_'),
    chunk_key;
  while (!chunk_key) {
    // let user_key = readlineSync.question('Please enter the password for encrypting : ', {
    //   mask: '',
    //   hideEchoBack: true,
    // });
    let user_key = 'password';
    if (!user_key) {
      if (readlineSync.keyInYN('Quit?')) process.exit();
    } else chunk_key = crypto.pbkdf2Sync(user_key, salt, 1024, 32, 'sha256');
  }

  let dummy = new XMAP({
    iv: crypto.randomBytes(16).toString('hex'),
    tag: crypto.randomBytes(16).toString('hex'),
    key: crypto.randomBytes(32).toString('hex'),
    salt: salt.toString('hex'),
    file: path.basename(input),
    size,
  });

  chunker
    .use(
      'cipher',
      ([{ chunkSize: size }, file, oldFile]) => {
        [file, oldFile] = [file, oldFile].map(file => path.basename(file));
        let iv = crypto.randomBytes(16),
          cipher = crypto.createCipheriv('aes-256-gcm', chunk_key, iv).once('finish', () => {
            dummy.stashChunk({
              iv: iv.toString('hex'),
              tag: cipher.getAuthTag().toString('hex'),
              size,
              file,
              oldFile,
            });
          });
        return cipher;
      },
      error => console.log(`An error occurred:\n${error}`)
    )
    .use('progressBar', ([{ chunkSize }, file], _persist) =>
      progressStream.next(chunkSize, {
        _template: { attachedMessage: `Writing to ${file}` },
      })
    );

  progressStream.on('complete', bar => {
    let file = path.join(path.dirname(output), '.xmap'),
      content = dummy.stringify();
    bar.end('Complete\n');
    console.log(`Writing map to ${file}`);
    fs.writeFile(file, content, () => {
      console.log(`Written map: ${parseBytes(content.length)}`);
      if (callback) callback(path.dirname(output));
    });
  });

  stream.pipeline(reader, chunker, chunkerOutput, err => err && console.error('An error occurred'));
}

function decrypt(folder, output, callback) {
  if (!fs.statSync(folder).isDirectory()) throw Error('Input file must be an existing directory');

  let _xmap = path.join(folder, '.xmap');
  if (!fs.existsSync(_xmap)) throw Error('Unable to locate and parse xmap file');

  let xmap = XMAP.parseFile(_xmap),
    inputBlocks = xmap.chunks.map(({ iv, tag, size, file }) => [
      { iv, tag, size, file },
      fs.createReadStream(path.join(folder, file)),
    ]),
    merger = new ReadMerger(),
    mergeStash = merger.fuse(...inputBlocks);

  console.log(`ByteStash Decrypt Demo`);
  console.log(` | Input File:       "${folder}"`);
  console.log(` | Output Directory: "${path.dirname(output)}"`);
  console.log(` | Total Size:       "${parseBytes(xmap.size)}"`);
  console.log(` | Number of chunks: "${xmap.chunks.length}`);

  let progressStream = prepareProgress(xmap.size, ProgressBar.slotsBySize(xmap.size, inputBlocks.map(block => block[0].size))).on(
      'complete',
      bar => {
        bar.end('Complete\n');
        if (callback) callback(output);
      }
    ),
    { bar } = progressStream;
  let chunk_key;
  while (!chunk_key) {
    // let user_key = readlineSync.question('Please enter the password for decrypting : ', {
    //   mask: '',
    //   hideEchoBack: true,
    // });
    let user_key = 'password';
    if (!user_key) {
      if (readlineSync.keyInYN('Quit?')) process.exit();
    } else chunk_key = crypto.pbkdf2Sync(user_key, xmap.salt, 1024, 32, 'sha256');
  }
  merger
    .use(
      'decipher',
      ([{ iv, tag }], _persist) => crypto.createDecipheriv('aes-256-gcm', chunk_key, iv).setAuthTag(tag),
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

  mergeStash.pipe(merger).pipe(fs.createWriteStream(output));
}

let args = process.argv.slice(2);
if (args.length == 2) encryptFolder(...args);
else if (args.length == 3 && args[0] == '-') decrypt(args[1], args[2]);
else
  console.error(`Please specify arguments as
  Encrypt           : \`<input file> <output template name>\`
  Decrypt           : \`- <input folder> <output file>\`
  Encrypt + Decrypt : \`<input file> <output template name> - <output file>\``);
