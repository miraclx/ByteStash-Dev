#!/bin/env node
let path = require('path'),
  xbytes = require('xbytes'),
  commander = require('commander');

/**
 * Attach commands to the CLI
 * @param {commander} commander The commander instance
 * @param {defaultCliHandles} param1 CLI Handles for commands
 */
function attachCommands(commander, { variables, encrypt, decrypt, cachemgr, clean }) {
  commander
    .usage('[<command> [<content...> [options]]] [-h]')
    .option('-l, --log [file]', 'log the output to file (default: runtime.xlog)')
    .option(
      '-v, --verbose',
      'be verbose (incremental) (-vv will include group salts (Not recommended))',
      (...[, v]) => v <= 2 && v + 1,
      0
    )
    .version(`ByteStash v${variables.version}`)
    .option('--no-color', 'do not output with any colors')
    .option('--no-bar', 'do not show the bar in any processes')
    .on('--help', showExamples);

  commander
    .command('encrypt <folder>')
    .alias('enc')
    .description('Encrypt a file or folder creating a bytestash container as the result')
    .option('-b, --bytes <bytes>', 'specify the bytes for each chunk')
    .option('-c, --chunks <num >= 5>', 'specify total number of chunks (useless with `-s` or `-b`)', 50)
    .option('-d, --force-dir', 'force stash to write in directory of input folder')
    .option('-g, --group-by <num >= 1>', 'number of chunks sharing similar salts', 5)
    .option('-k, --key <password>', 'collect the password from the args (Not recommended)')
    .option('-m, --merge', 'merge the output chunks, in a zip archive, for portability (auto inferred if `-o stdout`)')
    .option(
      "-o, --out <path|'stdout'>",
      "specify the path of the output stash, 'stdout' enforces `-m` and disables TTY logging",
      '<folder>.xtash'
    )
    .option('-s, --stream', 'stream the entire process, create no temporary archive collection')
    .option('-u, --no-compress', 'disable compression for the input')
    .option('-x, --export [file]', 'export un-encrypted xmap to the file (Not recommended) (default: exported.xmap)')
    .option('-z, --lz4', 'use lz4 compression over gzip (incompatible with `-u`)')
    .on('--help', showExamples.bind(null, 'encrypt'))
    .action(encrypt);

  commander
    .command('decrypt <file|folder>')
    .alias('dec')
    .description('Decrypt a ByteStash container')
    .option('-d, --force-dir', 'force stash to write in directory of input folder')
    .option('-k, --key <password>', 'collect the password from the args (Not recommended)')
    .option('-o, --out <path>', 'specifify the path for the decrypted archive', '<stashname>.unxtash')
    .on('--help', showExamples.bind(null, 'decrypt'))
    .action(decrypt);

  commander
    .command('cache')
    .description('Manage the bytestash cache')
    .option('-x, --clean', 'Clean the cache')
    .option('-h, --human-readable', 'Calculate the size of the cache')
    .action(cachemgr);

  commander
    .command('clean <stash>')
    .description('Clean a stash from unnecessary contents')
    .option('-i, --interractive', 'Clean the stash in interractive mode')
    .option('-h, --human-readable', 'Display the byte sizes in human readable format')
    .option('-v, --verbose', 'Show verbose output')
    .action(clean);
  return commander;
}

/**
 * Show examples for a particular command
 * @param {string} [type] A type of example to show
 */
function showExamples(type) {
  let msgs = {
    encrypt: `
    $ bytestash encrypt confidential
      ? Encrypt the \`confidential\` folder to \`confidential.xtash\` file
    $ bytestash encrypt confidential -c 100 -zg 5
      ? Encrypt the \`confidential\` folder to 100 chunks grouping 5 under a single cryptographic salt compiled with LZ4 algorithm
    $ bytestash enc ./folder -g 10 -c 100 -xlvvszk '#P@$$W0R9' --no-bar -o stdout
      ? Streamly encrypt \`./folder\` to 100 chunks encrypted with lz4, grouped by 10 in terms of salting, exporting the xmap, logging in an extra verbose level.
        Show no bars and output to stdout to be pipable to other source while specifying the key`,
    decrypt: `
    $  bytestash decrypt endoded -o ./top-secret
      ? Decrypt the \`encoded\` stash to the \`./top-secret\` folder
    $  bytestash decrypt stash4me -so ./_stash -k password
      ? Decrypt the stash to the specified folder with the inputed password`,
  };

  if (msgs[type]) console.log(`\n  Examples:\n${msgs[type]}\n`);
  else
    console.log(
      `\n  Examples:\n${Object.values(msgs)
        .filter(Boolean)
        .join('\n')}\n`
    );
}

class CliStashLog {
  constructor() {
    this.stash = [];
    this.maxLen = 0;
  }
  recalculate() {
    return this.stash.reduce((len, str) => Math.max(str.length, len), 0);
  }
  log(header, content) {
    this.maxLen = Math.max(header.length, (this.maxLen |= this.recalculate()));
    this.stash.push({ header, content, set: [null, undefined].includes(content) });
  }
  print() {
    return this.stash
      .map(
        ({ set, header, content }) =>
          `${header.padStart(this.maxLen + (!set ? 2 : 3 + header.length / 2))}${!set ? ` : ${content}` : ''}`
      )
      .join('\n');
  }
}

function getLogMethod(stasher, { log, logFile, verboseInText }) {
  if (log) {
    stasher.log('Log File', logFile);
    stasher.log('Log Method', verboseInText);
  } else stasher.log('Log', '<disabled>');
}

let defaultCliHandles = {
  '*': action => {
    throw Error(`[${action}] handle unimplemented`);
  },
  encrypt(folder, args) {
    let stasher = new CliStashLog();
    stasher.log('');
    stasher.log('Encryption Details');
    stasher.log('------------------');
    stasher.log('Action', 'Encryption');
    stasher.log('Input folder', folder);
    stasher.log('Output folder', args.out);
    stasher.log('Password', args.key);
    stasher.log('Merge output', args.merge);
    stasher.log('Group count', args.groupBy);
    stasher.log('Stream', args.stream);
    stasher.log('Number of chunks', args.chunks);
    stasher.log('Compress', args.compress);
    stasher.log('Compression method', args.compressMethod);
    getLogMethod(stasher, args);
    stasher.log('Export', args.xport);
    if (args.export) stasher.log('Export file', args.exportFile);
    stasher.log('Colorize', args.parent.color);
    stasher.log('Display progress bar', args.parent.bar);
    stasher.log('');
    console.log(stasher.print());
  },
  decrypt(files, args) {
    let stasher = new CliStashLog();
    stasher.log('');
    stasher.log('Decryption Details');
    stasher.log('------------------');
    stasher.log('Action', 'Decryption');
    stasher.log('Input (file/folder)', files);
    stasher.log('Output file', args.out);
    stasher.log('Password', args.key);
    getLogMethod(stasher, args);
    stasher.log('Colorize', args.color);
    stasher.log('Display progress bar', args.bar);
    stasher.log('');
    console.log(stasher.print());
  },
};

let argParser = {
  ['*']: (...args) => args.slice(-1).pop(),
  main(...rest) {
    let { bar, log, color, verbose } = rest.slice(-1)[0].parent;
    return {
      bar,
      color,
      log: !!log,
      logFile: log == true ? 'runtime.xlog' : log,
      verboseLevel: (verbose |= 0),
      verboseInText: (!verbose && 'Normal') || (verbose == 1 && 'Verbose') || (verbose == 2 && 'ExtraVerbose'),
    };
  },
  encrypt: (folder, { key, out, bytes, merge, stream, chunks, groupBy, compress, export: xport, forceDir, lz4 }) => ({
    key,
    out:
      out !== '<folder>.xtash'
        ? forceDir
          ? path.join(path.dirname(folder), out)
          : out
        : out.replace(/<folder>/, path.join(forceDir ? path.dirname(folder) : '.', path.basename(folder))),
    bytes: xbytes.parseSize(bytes | 0 || (stream ? 1 * 2 ** 10 : 0)) || 0,
    merge: out == 'stdout' || !!merge,
    xport: !!xport,
    chunks: stream ? Infinity : Math.max(chunks, 5),
    stream: !!stream,
    groupBy: Math.max(groupBy, 1),
    compress: !!compress,
    forceDir: !!forceDir,
    compressID: compress ? (!lz4 ? 1 : 2) : 0,
    exportFile: xport === true ? 'exported.xmap' : xport,
    compressMethod: compress ? (!lz4 ? 'gzip' : 'lz4') : '<disabled>',
    get outRelativePath() {
      return path.join(this.out, '..', path.basename(path.resolve('.', this.out)));
    },
    get outResolvedPath() {
      return path.resolve(this.outRelativePath);
    },
  }),
  decrypt: (folder, { key, out, forceDir }) => ({
    key,
    out:
      out !== '<stashname>.unxtash'
        ? forceDir
          ? path.join(path.dirname(folder), out)
          : out
        : out.replace(
            /<stashname>\.unxtash/,
            path.join(forceDir ? path.dirname(folder) : '.', path.basename(folder).replace(/\.xtash$/, '.unxtash'))
          ),
    forceDir: !!forceDir,
    get outRelativePath() {
      return path.join(this.out, '..', path.basename(path.resolve('.', this.out)));
    },
    get outResolvedPath() {
      return path.resolve(this.outRelativePath);
    },
  }),
};

module.exports = {
  commander,
  argParser,
  CliStashLog,
  attachCommands,
  defaultCliHandles,
};
