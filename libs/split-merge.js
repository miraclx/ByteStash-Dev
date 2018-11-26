let fs = require('fs'),
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
    if (typeof file !== 'string') throw Error('<file> parameter must be of type `string`');
    if (typeof output === 'object' && !Array.isArray(output))
      (options = output), (output = options.output || file.replace(/(?=.+)(\.\w+)$/, '%{numberPad%}$1'));
    if (typeof options !== 'object' && options !== undefined) throw Error('<options> parameter if specified must be an object');
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
      inputStream.on('error', callback);
      // When we're done with a chunk, emit the done event
      outputStream.on('finish', () => {
        self.emit('done', {in: inputStream.path, out: chunkInfo.outputFile});
        callback(null);
      });
      this.pipes
        .reduce((thisStream, {f, persist, label}, index) => {
          let _stream = f(chunkInfo.size, chunkInfo.outputFile, persist);
          if (!(_stream && _stream.readable && _stream.writable))
            throw Error(`Function labelled \`${label}\` should return a Duplex stream`);
          return thisStream.pipe(_stream);
        }, inputStream)
        .pipe(outputStream);
    };
    // Emits
    // `finish` When all chunks have finished
    // `done` When a chunk has finished
    // `error` When theres an error with a chunk copy
  }
  /**
   * @param {String} label Label for identifying function
   * @param {(() => stream.Duplex)} funcOftStream Function returning a Duplex stream
   */
  attach(label, funcOftStream) {
    if (typeof funcOftStream !== 'function')
      throw Error(
        'You can only pipe instances of Duplex streams or functions returning this. Consider a Through or Transform stream'
      );
    this.pipes.push({f: funcOftStream, persist: {}, label});
    return this;
  }
}
util.inherits(WriteChunker, stream.Writable);

class ReadMerger {
  constructor(files, output, options) {
    if (!Array.isArray(files)) throw Error('<files> parameter must be an Array');
    if (typeof output !== 'string') throw Error('<output> parameter must be specified as a string file path');
    if (typeof options !== 'object' && options !== undefined) throw Error('<options> parameter if specified must be an object');
    let prefs = (this.prefs = mergeOpts(options || {}, {
      objectMode: true,
      files: Array.from(files)
        .map(file => {
          let stat = fs.statSync(file);
          if (stat.isDirectory()) throw Error('Cant merge folders, is this really part of a file');
          else if (!stat.isFile()) throw Error('Specified part file is not valid');
          return {file, stat};
        })
        .map(({file, stat}) => ({
          path: file,
          stat,
          parsed: path.parse(file),
        })),
    }));
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

module.exports = {
  ReadChunker,
  WriteChunker,
  ReadMerger,
  WriteMerger,
};
