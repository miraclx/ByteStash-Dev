let fs = require('fs'),
  path = require('path'),
  util = require('util'),
  stream = require('stream'),
  {merge: mergeOpts} = require('lodash'),
  parseTemplate = require('./parse-template'),
  totalSize = require('./total-size');

/**
 * Build an output, `Writable` stream for `ReadChunker`
 * @param {...(stream:NodeJS.ReadableStream, size:number) => stream} pipes Functions to extend the stream and update based on size
 */
class WriteAttacher {
  constructor() {
    this.pipeStack = [];
    stream.Writable.call(this, {
      objectMode: true,
    });
  }
  /**
   * @param {String} label Label for identifying function
   * @param {(() => stream.Duplex)} funcOftStream Function returning a Duplex stream
   */
  attach(label, funcOftStream) {
    if (typeof funcOftStream !== 'function')
      this.emit(
        'error',
        new Error(
          'You can only attach functions returning instances of Duplex streams. Consider a PassThrough or Transform stream'
        )
      );
    this.pipeStack.push([funcOftStream, {}, label]);
    return this;
  }
  pipeAll(inStream, actFn) {
    return this.pipeStack.reduce((thisStream, block) => {
      let _stream = actFn(...block);
      if (!(_stream && _stream.readable && _stream.writable))
        this.emit('error', `Function labelled [${block[2]}] should return a Duplex stream`);
      return thisStream.pipe(_stream);
    }, inStream);
  }

  _write(chunkInfo, encoding, callback) {
    let {inputFile, outputFile} = chunkInfo;
    let inputStream = fs.createReadStream(inputFile, chunkInfo.inputStreamOpts);
    if (!fs.existsSync(outputFile)) fs.writeFileSync(outputFile, '');
    let outputStream = fs.createWriteStream(outputFile, chunkInfo.outputStreamOpts);
    inputStream.on('error', callback);
    // When we're done with a chunk, emit the done event
    outputStream.on('finish', () => {
      this.emit('done', {in: inputFile, out: outputFile});
      callback(null);
    });
    this.pipeAll(inputStream, (f, persist) => f(chunkInfo.size, chunkInfo.specialFile, persist)).pipe(outputStream);
  }
}
util.inherits(WriteAttacher, stream.Writable);

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
      totalSize: prefs.file.stat.size,
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
      let {nParts, splitSize, lastSplitSize, totalSize} = specs;
      if (splitSize < 1) throw Error('Either the file is too small, or too many parts specified');
      for (let i = 0; i < nParts; i++) {
        let {start, end} = {
          start: i * splitSize,
          end: i * splitSize + (i + 1 == nParts ? lastSplitSize : splitSize - 1),
        };
        let chunkInfo = {
          index: i,
          nParts,
          totalSize,
          number: i + 1,
          indexPad: i.toString().padStart(`${nParts - 1}`.length, 0),
          numberPad: (i + 1).toString().padStart(`${nParts}`.length, 0),
          start,
          end,
          size: end - start,
          inputFile: inputFile.path,
          inputStreamOpts: {start, end},
          outputStreamOpts: {},
        };
        chunkInfo.outputFile = parseTemplate(Array.isArray(files) ? files[i] : files, chunkInfo);
        chunkInfo.specialFile = chunkInfo.outputFile;
        yield chunkInfo;
      }
    })(this.specs, output);
    this.timesCalled = 0;
    this._read = function(/* n */) {
      if (this.timesCalled === this.specs.nParts) return this.push(null);
      this.timesCalled++;
      this.push(streamGenerator.next().value);
    };
  }
}
util.inherits(ReadChunker, stream.Readable);

class ReadMerger {
  // Trust the coder that files inputed are legit
  constructor(files, output, options) {
    if (!Array.isArray(files)) throw Error('<files> parameter must be an Array');
    if (typeof output !== 'string') throw Error('<output> parameter must be specified as a string file path');
    if (typeof options !== 'object' && options !== undefined) throw Error('<options> parameter if specified must be an object');
    let prefs = (this.prefs = mergeOpts(options || {}, {
      objectMode: true,
      files: files.map((file, index) => {
        let stat = fs.statSync(file);
        if (stat.isDirectory()) throw Error('Cant merge folders, is this really part of a file');
        else if (!stat.isFile()) throw Error('Specified part file is not valid');
        return {
          path: file,
          index,
          stat,
          parsed: path.parse(file),
        };
      }),
    }));
    let specs = (this.specs = {
      totalSize: prefs.files.reduce((a, b) => a + b.stat.size, 0),
      percentage() {
        return prefs.files.map(({stat}) => (stat.size / this.totalSize) * 100);
      },
    });
    stream.Readable.call(this, prefs);
    // Open a stream to the output file
    // In a generator, generate the next file's stream
    // On data, write into output file
    // Do this for the next files
    // On last file, end the output stream, end the globa stream
    let streamGenerator = (function*(files) {
      let bytesRead = 0;
      for (let {index, path, stat} of files) {
        index = parseInt(index);
        yield {
          index,
          nParts: files.length,
          totalSize: specs.totalSize,
          number: index + 1,
          indexPad: index.toString().padStart(`${files.length - 1}`.length, 0),
          numberPad: (index + 1).toString().padStart(`${files.length}`.length, 0),
          start: bytesRead,
          end: bytesRead + stat.size - 1,
          size: stat.size,
          inputFile: path,
          inputStreamOpts: {},
          outputStreamOpts: {flags: 'r+', start: bytesRead},
          outputFile: output,
          specialFile: path,
        };
        bytesRead += stat.size;
      }
    })(prefs.files, output);
    this.timesCalled = 0;
    this._read = function(/* n */) {
      if (this.timesCalled === files.length) return this.push(null);
      this.timesCalled++;
      this.push(streamGenerator.next().value);
    };
  }
}
util.inherits(ReadMerger, stream.Readable);

module.exports = {
  ReadChunker,
  ReadMerger,
  WriteAttacher,
};
