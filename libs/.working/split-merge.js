let fs = require('fs'),
  path = require('path'),
  util = require('util'),
  stream = require('stream'),
  through = require('through2'),
  { merge: mergeOpts } = require('lodash'),
  parseTemplate = require('./parse-template'),
  totalSize = require('./total-size');

/**
 * Build an output, `Writable` stream for `ReadChunker`
 * @param {...(stream:NodeJS.ReadableStream, size:number) => stream} pipes Functions to extend the stream and update based on size
 */
class WriteAttacher extends stream.Writable {
  constructor() {
    super({
      objectMode: true,
      write(chunkInfo, encoding, callback) {
        let { inputFile, outputFile } = chunkInfo;
        let inputStream = fs.createReadStream(inputFile, chunkInfo.inputStreamOpts);
        if (!fs.existsSync(outputFile)) fs.writeFileSync(outputFile, Buffer.alloc(0));
        let outputStream = fs.createWriteStream(outputFile, chunkInfo.outputStreamOpts);
        inputStream.on('error', callback);
        // When we're done with a chunk, emit the done event
        outputStream.on('finish', () => {
          this.emit('done', { in: inputFile, out: outputFile });
          callback(null);
        });
        this.pipeAll(inputStream, (f, persist) => f(chunkInfo.size, chunkInfo.specialFile, persist)).pipe(outputStream);
      },
    });

    this.pipeStack = [];
  }
  /**
   * Middleware functions returning fresh pipes to be attached on every chunk
   * @param {String} label Label for identifying function
   * @param {((size: number, file: string, persist: {}) => stream.Duplex)} funcOftStream Function returning a Duplex stream
   */
  use(label, funcOftStream) {
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
}
// util.inherits(WriteAttacher, stream.Writable);

class ReadChunker extends stream.Transform {
  /**
   * @param {Number | {size: number, total: number, length: number}} spec Length of all chunks or options for the execution
   */
  constructor(spec) {
    /**
     * @param {number} options.size            Size of each chunk, higher precedence
     * @param {number} options.length          Length of chunks, lower precedence
     * @param {number} options.total           Total size of all chunks
     * @param {boolean} options.appendOverflow Whether or not to append overflow to last file otherwise, create a new file
     */
    let options = {
      size: null,
      length: null,
      total: Infinity,
      appendOverflow: true,
    };

    if (typeof spec === 'number') options.size = spec;
    else if (typeof spec === 'object') options = mergeOpts(options, spec);
    else throw Error('<spec> parameter must either be an object or a number');
    if (!options.size) {
      if (options.length) {
        if (!options.total) throw Error('<.total> must be set when specifying <spec:{}>.length');
        else if (options.total === Infinity) throw Error('<.total> must be defined and specific when setting <spec:{}>.length');
        options.size = Math.floor(options.total / options.length);
      } else throw Error('<.size> must be specified as <spec> or <spec:{}>.size');
    }

    let streamGenerator = generateChunk(options.total, options.size);

    let transformSpec = {
      objectMode: true,
      halfOpen: false,
      transform(data, _encoding, next) {
        let { value } = streamGenerator.next(data);
        next(null, value);
      },
      flush(next) {
        console.log('flushing');
        let _done = false;
        do {
          let { value, done } = streamGenerator.next(Buffer.from(''));
          if (!done) {
            if (!value.data.length) done = true;
            else this.push(value);
          }
          _done = done;
        } while (!_done);
        next();
      },
    };

    super(transformSpec);

    Object.assign(this, { spec: streamGenerator.next().value });

    function* generateChunk(total, splitSize) {
      let splitLength = total / splitSize;
      let numberOfParts = options.appendOverflow ? Math.floor(splitLength) : Math.ceil(splitLength);
      let lastSplitSize = options.appendOverflow ? splitSize + (total % splitSize) : total % splitSize;
      let firstRun = true,
        bytesRead = 0,
        chunkBytesRead = 0,
        data = new Buffer.alloc(0),
        overflow = new Buffer.alloc(0);

      while (bytesRead < total) {
        if (firstRun) {
          firstRun = !(data = yield { total, numberOfParts, splitSize, lastSplitSize });
        } else {
          if (chunkBytesRead == splitSize) chunkBytesRead = 0;
          let fillable = splitSize - chunkBytesRead;
          let sliceIndex = Math.min(fillable, data.length);
          overflow = data.slice(sliceIndex, Infinity);
          data = data.slice(0, sliceIndex);

          bytesRead += data.length;
          chunkBytesRead += data.length;

          let isLastChunk = bytesRead == total;
          let number =
              Math.ceil(bytesRead / splitSize) - (isLastChunk && options.appendOverflow && splitSize !== lastSplitSize ? 1 : 0),
            index = number - 1;

          data = Buffer.concat([
            overflow,
            yield {
              data,
              size: data.length,
              last: isLastChunk,
              spec: {
                index,
                _index: total === Infinity ? index : index.toString().padStart(`${numberOfParts}`.length, 0),
                number,
                _number: total === Infinity ? number : number.toString().padStart(`${numberOfParts}`.length, 0),
                total: numberOfParts,
              },
            },
          ]);
        }
      }
    }
    this.pipeStack = [];
  }
  use(label, fn) {
    // Push functions into a stack of pipe derivative functions
    if (typeof fn !== 'function')
      this.emit(
        'error',
        new Error(
          'You can only attach functions returning instances of Duplex streams. Consider a PassThrough or Transform stream'
        )
      );
    this.pipeStack.push([fn, {}, label]);
    return this;
  }
  /**
   *
   * @param {String|Buffer|(String|Buffer)[]} output Output file(s) to be written to
   * @returns {NodeJS.WriteStream}
   */
  fiss(output) {
    let self = this;
    // pipe all pipe stacks for every pipe
    return stream.Writable({
      objectMode: true,
      write(chunkData, encoding, callback) {
        this.stage = this.stage || { index: -1, file: null, reader: null, writer: null };
        let { file, reader, writer } = this.stage;
        if (chunkData.spec.index !== this.stage.index) {
          file = parseTemplate(output, chunkData.spec);
          if (this.stage.reader) this.stage.reader.push(null);
          this.stage = {
            index: chunkData.spec.index,
            file,
            reader: stream.Readable({
              read() {},
            }),
            writer: fs.createWriteStream(file),
          };
          ({ file, reader, writer } = this.stage);
          self.pipeStack
            .reduce((thisStream, block) => {
              let _stream = block[0].apply(null, [chunkData.size, file, block[1]]);
              if (!(_stream && _stream.readable && _stream.writable))
                this.emit('error', `Function labelled [${block[2]}] should return a Duplex stream`);
              return thisStream.pipe(_stream);
            }, reader)
            .pipe(writer);
          self.emit('chunk', file);
        }
        reader.push(chunkData.data);
        if (chunkData.last) reader.push(null);
        callback(null, chunkData);
      },
    });
  }
}

class ReadMerger extends stream.Readable {
  // Trust the coder that files inputed are legit
  constructor(files, output, options) {
    if (!Array.isArray(files)) throw Error('<files> parameter must be an Array');
    if (typeof output !== 'string') throw Error('<output> parameter must be specified as a string file path');
    if (typeof options !== 'object' && options !== undefined) throw Error('<options> parameter if specified must be an object');
    let prefs = mergeOpts(options || {}, {
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
    });
    super(prefs);
    this.prefs = prefs;

    let specs = (this.specs = {
      totalSize: prefs.files.reduce((a, b) => a + b.stat.size, 0),
      percentage() {
        return prefs.files.map(({ stat }) => (stat.size / this.totalSize) * 100);
      },
    });
    // Open a stream to the output file
    // In a generator, generate the next file's stream
    // On data, write into output file
    // Do this for the next files
    // On last file, end the output stream, end the globa stream
    let streamGenerator = (function*(files) {
      let bytesRead = 0;
      for (let { index, path, stat } of files) {
        index = parseInt(index);
        yield {
          index,
          nParts: files.length,
          totalSize: specs.totalSize,
          number: index + 1,
          indexPad: index.toString().padStart(`${files.length - 1}`.length, 0),
          numberPad: (index + 1).toString().padStart(`${files.length}`.length, 0),

          size: stat.size,
          inputFile: path,
          inputStreamOpts: {},
          outputStreamOpts: { start: bytesRead },
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

module.exports = {
  ReadChunker,
  ReadMerger,
  WriteAttacher,
};

/* 
=== === ===
==CHUNKER==
=== === ===
ReadChunker extends stream.Transform {
  constructor(spec: number | {
    length: number,
    size: number,
    total: number,
    appendOverflow: boolean
  }) => this,
  use(label: string, (size: number, file: string, persist: {}) => stream.Transform) => this,
  fiss(output: string | string[] | Buffer | Buffer[]) => stream.Writable,
}

let input = fs.createReadStream('./file');
let chunker = new ReadChunker({length: 50})
  .use(() => stream.Transform({
    transform(v,_e,c) {
      c(null, v);
    }
  }));
let chunkerOutput = chnuker.fiss('./file%{index%}.txt');
input.pipe(chunker).pipe(chunkerOutput);

=== === ===
==MERGER==
=== === ===
Create write stream to output file
For every new slot, write content
on'end', un-end

Merger extends stream.Transform {
  constructor() => this,
  use(label: string, (size: number, file: string, persist: {}) => stream.Transform) => this,
  fuse(input:
    string
    | string[]
    | Buffer
    | Buffer[]
    | stream.Readable
  ) => this,            // **--** Stage the input as a chunk slot until this.write called
}

let merger = new Merger()
  .use(() => stream.Transform({
    transform(v,_e,c) {
      c(null, v);
    }
  }))
  .fuse('./file')
  .fuse(['./file2', './file3'])
  .fuse(fs.createReadStream('./file3'));

let output = fs.createWriteStream('./output.js');
merger.pipe(output);
*/
