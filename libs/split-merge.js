/**
 * @copyright (c) 2017 Miraculous Owonubi
 * @author Miraculous Owonubi
 * @license Apache-2.0
 * @module split-merge
 */

let fs = require('fs'),
  { Transform, Readable, Writable } = require('stream'),
  EventEmitter = require('events'),
  { merge: mergeOpts } = require('lodash'),
  parseTemplate = require('./parse-template');

class TransformWithMiddleWare extends Transform {
  constructor(options) {
    super(options);
    this.pipeStack = [];
  }
  /**
   * Middleware extender, transform and manipulate the chunk streams
   * @param {String} label Label for the middleware, useful for debugging
   * @param {(...any[], persist: {}) => NodeJS.ReadWriteStream} fn Function returning a transform stream
   * @param {{}} persist An object to hold static values for every call
   */
  use(label, fn, persist = {}, callback) {
    // Push functions into a stack of pipe derivative functions
    if (typeof fn !== 'function')
      this.emit(
        'error',
        new Error(
          'You can only attach functions returning instances of Duplex streams. Consider a PassThrough or Transform stream'
        )
      );
    if (!label || typeof label !== 'string') throw Error('Please specify <label> as a :String');
    else if (!fn || typeof fn !== 'function') throw Error('Please specify <fn> as a :Function');
    if (persist && typeof persist === 'function') [callback, persist] = [persist, null];
    this.pipeStack.push([fn, { label, persist, callback }]);
    return this;
  }
  /**
   * Create a piped chain from all the middleware functions
   * @param {NodeJS.ReadableStream} reader The root readable stream
   * @param  {...any[]} data First arguments to the pipestack function
   */
  pipeAll(reader, ...data) {
    return this.pipeStack.reduce((thisStream, [fn, { label, persist, callback }]) => {
      let _stream = fn(data, persist);
      if (!(_stream instanceof EventEmitter && [_stream.read, _stream.write].every(slot => typeof slot == 'function')))
        this.emit('error', `Function labelled [${label}] should return a Duplex stream`);
      if (callback) _stream.on('error', callback);
      return thisStream.pipe(_stream);
    }, reader);
  }
}

class ReadChunker extends TransformWithMiddleWare {
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
        options.appendOverflow = true;
      } else throw Error('<.size> must be specified as <spec> or <spec:{}>.size');
    }

    let remainder = options.total % options.size;

    let _spec = {
        total: options.total,
        splitSize: Math.min(options.size, options.total),
        numberOfParts: (options.appendOverflow ? Math.floor : Math.ceil).call(null, options.total / options.size),
        lastSplitSize: options.appendOverflow ? options.size + remainder : remainder || options.size,
      },
      { total, splitSize, numberOfParts, lastSplitSize } = _spec;

    let overflow = new Buffer.alloc(0);

    /**
     * Transforming chunker
     * @param {string|Buffer} data Flowing input stream to be chunked
     * @param {string} _encoding Encoding for the content
     * @param {Function} next Function for loading next chunk
     */
    function transform(data, _encoding, next) {
      // Append the previous buffer overflow, if any
      data = Buffer.concat([overflow, data]);

      let length = data.length,
        chunkCount = Math.ceil(length / splitSize);
      for (let i = 1; i <= chunkCount; i++) {
        let chunk = data.slice(0, splitSize - this.chunkBytesRead);
        if (!chunk.length) continue;
        data = data.slice(splitSize - this.chunkBytesRead, Infinity);
        this.bytesRead += chunk.length;
        this.chunkBytesRead += chunk.length;

        let isLastChunk =
            Math.ceil((this.bytesRead + (options.appendOverflow ? splitSize - lastSplitSize : 0)) / splitSize) === numberOfParts,
          chunkSize = isLastChunk ? lastSplitSize : splitSize;

        let number = Math.min(Math.ceil(this.bytesRead / splitSize), numberOfParts);
        let index = number - 1;
        let chunkPartData = {
            size: chunk.length,
            remaining: chunkSize - this.chunkBytesRead,
            finalPart: this.chunkBytesRead == chunkSize,
          },
          chunkData = {
            chunkSize,
            finalChunk: isLastChunk,
            index,
            _index: total === Infinity ? index : index.toString().padStart(`${numberOfParts}`.length, 0),
            number,
            _number: total === Infinity ? number : number.toString().padStart(`${numberOfParts}`.length, 0),
          };
        this.push([chunk, chunkPartData, chunkData]);
        if (this.chunkBytesRead == chunkSize) this.chunkBytesRead = 0;
      }
      overflow = data;
      next();
    }

    let transformSpec = {
      objectMode: true,
      halfOpen: false,
      transform,
      flush(next) {
        if (overflow.length) {
          this.bytesRead += overflow.length;
          this.chunkBytesRead += overflow.length;

          let isLastChunk = this.bytesRead === total,
            chunkSize = isLastChunk ? lastSplitSize : splitSize;

          let number = numberOfParts,
            index = number - 1;

          let chunkPartData = {
              size: overflow.length,
              remaining: chunkSize - this.chunkBytesRead,
              finalPart: this.chunkBytesRead == chunkSize,
            },
            chunkData = {
              chunkSize,
              finalChunk: isLastChunk,
              index,
              _index: total === Infinity ? index : index.toString().padStart(`${numberOfParts}`.length, 0),
              number,
              _number: total === Infinity ? number : number.toString().padStart(`${numberOfParts}`.length, 0),
            };

          this.push([overflow, chunkPartData, chunkData]);
          if (this.chunkBytesRead == chunkSize) this.chunkBytesRead = 0;
        }
        next();
      },
    };

    super(transformSpec);
    this.spec = _spec;
    this.bytesRead = this.chunkBytesRead = 0;
  }

  /**
   * Recieve and control the output chunks
   * @param {string | string[] | Buffer | Buffer[] | NodeJS.WritableStream)} output Output file(s) to be written to
   * @param {(file:string) => string} [outputManipulator] Function to manipulate the input file, (if -any)
   * @returns {NodeJS.WritableStream}
   */
  fiss(output, outputManipulator) {
    let self = this;
    // pipe all pipe stacks for every pipe
    return Writable({
      objectMode: true,
      write([data, chunkPartData, chunkData], encoding, next) {
        this.stage = this.stage || { index: -1, file: null, reader: null, writer: null };
        let { file, reader, _reader, writer, _writer } = this.stage;

        if (chunkData.index !== this.stage.index) {
          let oldFile;
          file = typeof output == 'string' ? parseTemplate(output, chunkData) : null;
          if (outputManipulator) [file, oldFile] = [outputManipulator(file), file];
          reader = Readable({
            read() {},
          });
          this.stage = {
            index: chunkData.index,
            file,
            reader,
            _reader: self.pipeAll(reader, chunkData, file, oldFile),
            writer:
              typeof output == 'string'
                ? fs.createWriteStream(file)
                : output instanceof EventEmitter && typeof output.write == 'function'
                  ? output
                  : null,
            _writer: Writable({
              write: (data, e, cb) => {
                if (!writer.write(data, () => _writer.emit('done'))) writer.once('drain', cb);
                else process.nextTick(cb);
              },
            }),
          };
          ({ file, reader, _reader, writer, _writer } = this.stage);
          _reader.pipe(_writer);
          if (!writer) self.emit('error', 'Output should be defined as a writable stream or a definite output file template');
        }

        function clean() {
          if (chunkPartData.finalPart) reader.push(null);
          next();
        }
        _writer.once('done', clean);
        reader.push(data);
      },
    });
  }
}

class ReadMerger extends TransformWithMiddleWare {
  constructor() {
    super({
      objectMode: true,
      transform([size, rStream], _encoding, callback) {
        this.pipeAll(rStream, size)
          .on('data', data => this.push(data))
          .once('end', callback);
      },
    });
  }
  /**
   * Fuse readable streams data together to a single writable stream
   * @param  {...[any, NodeJS.ReadableStream]} src Readable stream sources
   * @param {number} src_0 Size of the chunk being added
   * @param {NodeJS.ReadableStream} src_1 The readable stream itself
   */
  fuse(...src) {
    let reader = Readable({
      objectMode: true,
      read() {},
    });
    if (src) src.reduce((reader, _reader) => (reader.push(_reader), reader), reader);
    return reader;
  }
}

module.exports = {
  ReadChunker,
  ReadMerger,
  TransformWithMiddleWare,
};
