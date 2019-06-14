let fs = require('fs'),
  tmp = require('tmp'),
  path = require('path'),
  stream = require('stream'),
  zlib = require('zlib'),
  tar_fs = require('tar-fs'),
  { isBarGen } = require('../_dev.libs/xprogress');

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

module.exports = {
  prepWorkSpace,
  /**
   *
   * @param {String} input Input path to be compiled
   * @param {{cacheDir:string, direct:boolean, compressID:number, progressGen}}
   * @param {(NodeJS.ReadableStream)} callback Callback for compressed stream passon
   */
  compile(input, { size, stack, direct, cacheDir, compressID, progressGen }, callback) {
    let template = args => ({
      name: '',
      action: 'compile',
      actionStr: 'Compressing',
      actionMsg: `:{actionStr}:{name}`,
      ...args,
    });
    let _stream = stack
      ? tar_fs.pack(
          input,
          isBarGen(progressGen) && !direct
            ? {
                mapStream: (fStream, headers) =>
                  fStream.pipe(
                    progressGen.next(headers.size, {
                      variables: template({ name: ` [${headers.name}]`, actionStr: 'Compiling' }),
                    })
                  ),
              }
            : {}
        )
      : fs.createReadStream(input).pipe(progressGen.next(size, { variables: template() }));

    if (compressID) _stream = _stream.pipe(compressID == 1 ? zlib.createGzip() : zlib.createInflate());
    if (direct) callback(_stream, Infinity);
    else if (!stack && !compressID) callback(_stream, size);
    else {
      let tmpPath = tmp.fileSync({ prefix: 'byteX-', postfix: stack ? '.tgz' : '.gz', dir: cacheDir, keep: true });
      stream.pipeline(_stream, fs.createWriteStream(tmpPath.name), () =>
        callback(fs.createReadStream(tmpPath.name), fs.statSync(tmpPath.name).size).on('finish', tmpPath.removeCallback)
      );
    }
  },
  decompile(_stream, out, { stack, compressID, progressGen }, callback) {
    if (compressID) _stream = _stream.pipe(compressID == 1 ? zlib.createGunzip() : zlib.createDeflate());
    return stream.pipeline(
      _stream,
      stack
        ? tar_fs.extract(
            out,
            isBarGen(progressGen) ? { map: headers => ((progressGen.bar.opts.variables['file'] = headers.name), headers) } : {}
          )
        : ((progressGen.bar.opts.variables['file'] = out), fs.createWriteStream(out)),
      callback
    );
  },
};
