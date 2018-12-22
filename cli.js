#!/bin/env node

/**
 * Attach commands to the CLI
 * @param {commander} commander The commander instance
 * @param {defaultCliHandles} param1 CLI Handles for commands
 */
function attachCommands(commander, { bytestash: { version }, encrypt, decrypt, add, push }) {
  commander
    .usage('[commands] [options]')
    .option('-l, --log [file]', 'log the output to file (default: runtime.xlog)')
    .option(
      '-v, --verbose',
      'be verbose (incremental) (-vv will include group salts (Not recommended))',
      (...[, v]) => v <= 2 && v + 1,
      0
    )
    .version(`ByteStash v${version}`)
    .option('--no-color', 'do not output with any colors')
    .option('--no-bar', 'do not show the bar in any processes')
    .on('--help', showExamples);

  commander
    .command('encrypt <folder>')
    .alias('e')
    .option('-c, --chunks <num>', 'specify total number of chunks (incompatible with `-s`)', 50)
    .option('-g, --group-by <num>', 'number of chunks sharing similar salts', 5)
    .option('-k, --key <password>', 'collect the password from the args (Not recommended)', '<query>')
    .option('-m, --merge', 'merge the output chunks, in a zip archive, for portability (auto inferred if `-o stdout`)')
    .option("-o, --out <path|'stdout'>", 'specify the path of the output stash', '<folder>.stash')
    .option('-s, --stream', 'stream the entire process, create no temporary archive collection')
    .option('-u, --no-compress', 'Use no compression for the input folder')
    .option('-x, --export [file]', 'export un-encrypted xmap to the file (Not recommended) (default: exported.xmap)')
    .option('-z, --lz4', 'use lz4 compression instead (incompatible with `-u`)')
    .on('--help', showExamples.bind(null, 'encrypt'))
    .action(encrypt);

  commander
    .command('decrypt <file|folder>')
    .alias('d')
    .option('-k, --key <password>', 'collect the password from the args (Not recommended)', '<query>')
    .option('-o, --out <path>', 'specifify the path for the decrypted archive', '<filename>')
    .option('-s, --stream', 'stream the entire process, no initial decompression')
    .on('--help', showExamples.bind(null, 'decrypt'))
    .action(decrypt);

  commander
    .command('add <folder>')
    .alias('a')
    .option('-p, --pretty', 'sit still, look pretty')
    .on('--help', showExamples.bind(null, 'add'))
    .action(add);

  commander
    .command('push <folder>')
    .alias('p')
    .option('-p, --pretty', 'sit still, look pretty')
    .on('--help', showExamples.bind(null, 'push'))
    .action(push);

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
      ? Encrypt the \`confidential\` folder to \`confidential.xbit\` file
    $ bytestash encrypt confidential -c 100 -zg 5
      ? Encrypt the \`confidential\` folder to 100 chunks grouping 5 under a single cryptographic salt compiled with LZ4 algorithm\n`,
    decrypt: `
    $ bytestash decrypt encoded
      ? Decrypt the \`encoded\` enclave to the \`confidential\` folder
    $  bytestash decrypt endoded -o ./top-secret
      ? Decrypt the \`encoded\` enclave to the specified folder\n`,
    add: ``,
    push: ``,
  };
  console.log(`  Examples:\n${msgs[type] || msgs['encrypt']}`);
}

class StashLog {
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

function getLogMethod(stasher, { log, logfile, verboseInText }) {
  if (log) {
    stasher.log('Log File', logfile);
    stasher.log('Log Method', verboseInText);
  } else stasher.log('Log', '<disabled>');
}

let defaultCliHandles = {
  encrypt(folder, args) {
    let stasher = new StashLog();
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
    stasher.log('Export', args.export);
    if (args.export) stasher.log('Export file', args.exportFile);
    stasher.log('Colorize', args.parent.color);
    stasher.log('Display progress bar', args.parent.bar);
    stasher.log('');
    console.log(stasher.print());
  },
  decrypt(files, args) {
    let stasher = new StashLog();
    stasher.log('');
    stasher.log('Decryption Details');
    stasher.log('------------------');
    stasher.log('Action', 'Decryption');
    stasher.log('Input (file/folder)', files);
    stasher.log('Output file', args.out);
    stasher.log('Password', args.key);
    stasher.log('Stream', args.stream);
    getLogMethod(stasher, args);
    stasher.log('Colorize', args.parent.color);
    stasher.log('Display progress bar', args.parent.bar);
    stasher.log('');
    console.log(stasher.print());
  },
  add: () => {},
  push: () => {},
};

let argParser = {
  main(folder, args) {
    let { log, verbose } = args.parent;
    args.log = !!log;
    args.logfile = log == true ? 'runtime.xlog' : log;
    args.verbose = verbose |= 0;
    args.verboseInText = (!verbose && 'Normal') || (verbose == 1 && 'Verbose') || (verbose == 2 && 'ExtraVerbose');
    return args;
  },
  encrypt(folder, args) {
    args.out = args.out.replace(/<folder>/, folder);
    args.merge = args.out == 'stdout' || !!args.merge;
    args.stream = !!args.stream;
    args.chunks = args.stream ? '<rolling>' : args.chunks;
    args.compress = !!args.compress;
    args.compressMethod = args.compress ? (!args.lz4 ? 'gzip' : 'lz4') : '<disabled>';
    args.exportFile = args.export === true ? 'exported.xmap' : args.export;
    args.export = !!args.export;
    return args;
  },
  '*': (...[, args]) => args,
};

module.exports = function(bytestash, handles) {
  let commander = require('commander');
  let stack = {
    bytestash,
  };
  for (let [action, handle] of Object.entries({
    ...defaultCliHandles,
    ...handles,
  }))
    stack[action] = (data, args) =>
      handle(data, [argParser['main'], argParser[action] || argParser['*']].reduce((args, fn) => fn(data, args), args));

  attachCommands(commander, stack).parse(bytestash.argv);
};
