let fs = require('fs'),
  tmp = require('tmp'),
  path = require('path'),
  stream = require('stream'),
  zlib = require('zlib'),
  tar_fs = require('tar-fs'),
  XMAP = require('./libs/xmap'),
  ProgressBar = require('./libs/progress2');

function prepProgress(size, slots, opts) {
  let progressStream = ProgressBar.stream(size, slots, {
    bar: {
      filler: '=',
      header: '\ue0b0',
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
  XMAP,
  prepProgress,
  prepWorkSpace,
  chunk(inStream, size) {},
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
      actionMsg: `:{actionStr} [:{name}:{slot:size}/:{slot:size:total}]...:{slot:eta}s`,
      ...args,
    });
    let _stream = stack
      ? tar_fs.pack(
          input,
          ProgressBar.isBarGen(progressGen) && !direct
            ? {
                mapStream: (fStream, headers) =>
                  fStream.pipe(
                    progressGen.next(headers.size, {
                      variables: template({ name: `${headers.name} -> `, actionStr: 'Compiling' }),
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
      let tmpPath = tmp.fileSync({ prefix: 'byteX-', postfix: '.tgz', dir: cacheDir, keep: true });
      stream.pipeline(_stream, fs.createWriteStream(tmpPath.name), () =>
        callback(fs.createReadStream(tmpPath.name), fs.statSync(tmpPath.name).size).on('finish', tmpPath.removeCallback)
      );
    }
  },
  decompile(_stream, out, { size, stack, compressID, progressGen }, callback) {
    if (compressID) _stream = _stream.pipe(compressID == 1 ? zlib.createGunzip() : zlib.createDeflate());
    stream.pipeline(
      _stream,
      stack
        ? tar_fs.extract(out, {
            mapStream: (fStream, headers) =>
              fStream.pipe(progressGen.next(headers.size, { variables: { file: path.join('/', headers.name) } })),
          })
        : fs.createWriteStream(out).pipe(progressGen.next(size, { variables: { file: path.join('/', out) } })),
      callback
    );
  },
};
