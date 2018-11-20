const fs = require('fs'),
  path = require('path'),
  util = require('util'),
  stream = require('stream'),
  {merge: mergeOpts} = require('lodash'),
  parseTemplate = require('./parse-template');

/**
 *
 * @param {String} file Input file
 * @param {String|String[]} output Output file(s)
 * @param {Object} options Options for the execution
 */
class ReadChunker {
  constructor(file, output, options) {
    if (!(this instanceof ReadChunker)) return new ReadChunker(file, options);
    if (typeof file !== 'string') throw Error('file parameter must be of type `string`');
    if (typeof output === 'object' && !Array.isArray(output))
      (options = output), (output = options.output || file.replace(/(?=.+)(\.\w+)$/, '%s$1'));
    let prefs = (this.prefs = mergeOpts(options || {}, {
      objectMode: true,
      file: {
        path: file,
        stat: fs.statSync(file),
        parsed: path.parse(file),
      },
    }));
    let {file: inputFile} = prefs;
    stream.Readable.call(this, this.prefs);
    if (inputFile.stat.isDirectory()) throw Error('Cant chunk folders, consider zipping first');
    else if (!inputFile.stat.isFile()) throw Error('Input file is not valid');
    if (inputFile.stat.size == 0) throw Error('Input file is literally in nothing-ness');
    let method = Array.isArray(output) ? 1 : prefs.length ? 2 : prefs.size ? 3 : 0;
    this.specs = {
      method,
      nParts:
        method == 1 ? output.length : method == 2 ? prefs.length : method == 3 ? Math.ceil(inputFile.stat.size / prefs.size) : 0,
      percentage() {
        let result = [...Array(this.nParts)].fill((this.splitSize / inputFile.stat.size) * 100);
        result[result.length - 1] = (this.lastSplitSize / inputFile.stat.size) * 100;
        return result;
      },
      get splitSize() {
        return method == 3 ? prefs.size : Math.floor(inputFile.stat.size / this.nParts);
      },
      get lastSplitSize() {
        // return this.splitSize + (inputFile.stat.size % this.nParts);
        return prefs.file.stat.size - (this.nParts - 1) * this.splitSize;
      },
    };
    if (!this.specs.nParts) throw Error('Unable to infer chunk length');
    let streamGenerator = (function*(specs, files) {
      let {nParts, splitSize, lastSplitSize} = specs;
      if (splitSize < 1) throw Error('Either the file is too small, or too many parts specified');
      for (let i = 0; i < nParts; i++) {
        let chunkInfo = {
          index: i,
          nParts,
          number: i + 1,
          numberPad: (i + 1).toString().padStart(`${nParts}`.length, 0),
          start: i * splitSize,
          end: i * splitSize + (i + 1 == nParts ? lastSplitSize : splitSize),
          get size() {
            return this.end - this.start;
          },
        };
        chunkInfo.inputStream = fs.createReadStream(inputFile.path, chunkInfo);
        chunkInfo.outputFile = parseTemplate(Array.isArray(files) ? files[i] : files, chunkInfo);
        yield chunkInfo;
      }
    })(this.specs, output);
    this.timesCalled = 0;
    this._read = function(n) {
      if (this.timesCalled === this.specs.nParts) return this.push(null);
      this.timesCalled++;
      this.push(streamGenerator.next().value);
    };
  }
}

util.inherits(ReadChunker, stream.Readable);

/**
 * Build an output, `Writable` stream for `ReadChunker`
 * @param {...(stream:NodeJS.ReadableStream, size:number) => stream} pipes Functions to extend the stream and update based on size
 */
class WriteChunker {
  constructor() {
    if (!(this instanceof WriteChunker)) return new WriteChunker();
    stream.Writable.call(this, {
      objectMode: true,
    });
    this.pipes = [];
    let self = this;
    this._write = function(chunkInfo, encoding, callback) {
      let {inputStream} = chunkInfo;
      let outputStream = fs.createWriteStream(chunkInfo.outputFile);
      inputStream.on('end', () => {
        if (chunkInfo.number == chunkInfo.nParts) self.emit('complete');
        callback();
      });
      this.pipes
        .reduce((thisStream, funcOftStream, index) => {
          let _stream = funcOftStream(chunkInfo);
          if (!(_stream && _stream.readable && _stream.writable))
            throw Error(`Functional pipe at index <${index}> should return a Duplex stream`);
          return _stream;
        }, inputStream)
        .pipe(outputStream);
    };
  }
  /**
   *
   * @param {(() => stream.Duplex)} funcOftStream Function returning a Duplex stream
   */
  attach(funcOftStream) {
    if (typeof funcOftStream !== 'function')
      throw Error(
        'You can only pipe instances of Duplex streams or functions returning this. Consider a Through or Transform stream'
      );
    this.pipes.push(funcOftStream);
    return this;
  }
}
util.inherits(WriteChunker, stream.Writable);

class ReadMerger {
  constructor() {
    stream.Readable.call(this, {
      objectMode: true,
    });
  }
}
util.inherits(ReadMerger, stream.Readable);

class WriteMerger {
  constructor() {
    stream.Writable.call(this, {
      objectMode: true,
    });
  }
}
util.inherits(WriteMerger, stream.Writable);

module.exports = {ReadChunker, WriteChunker};
