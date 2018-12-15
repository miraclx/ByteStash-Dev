#!/bin/env node
let commander = require('commander');

function attachMain(commander, bytestash) {
  commander
    .version(`ByteStash v${bytestash.version}`)
    // .description(bytestash.tagHeader())
    .usage('[commands] [options]')
    .option('-l, --log [file]', 'log the output to file', 'compile.log')
    .option(
      '-v, --verbose',
      'be Verbose Incremental (-vv will include hashes (Not recommended))',
      (...[, v]) => v <= 2 && v + 1,
      0
    )
    .option('--no-color', 'Do not output with any colors', false);
}

function attachEncrypt(commander, fn) {
  commander
    .command('encrypt <file...>')
    .alias('e')
    .option('-e, --encrypt-by <method>', 'Method to perform encryption [chunk|archive]', 'archive')
    .option('-o, --out <archive path>', 'specify the path of the output archive', '<filename>')
    .option('-p, --password <password>', 'collect the password from the args (Not recommended)', '<query>')
    .option('-r, --random-hash', 'Use random hashes for each chunk encryption (Only compatible with `-e chunks`)')
    .option('-x, --export [file]', 'export the keys and un-encrypted structuring to the file (Not recommended)')
    .option('--no-xbit', 'do not force the *.xbit extension on the archive')
    .on('--help', showExamples.bind(null, 'encrypt'))
    .action(fn);
}

function attachDecrypt(commander, fn) {
  commander
    .command('decrypt <file>')
    .alias('d')
    .option('-o, --out <path>', 'specifify the path for the decrypted archive', '<filename>')
    .option('-p, --password <password>', 'collect the password from the args (Not recommended)', '<query>')
    .on('--help', showExamples.bind(null, 'decrypt'))
    .action(fn);
}

function showExamples(type) {
  let msgs = {
    encrypt: `
    $ bytestash encrypt confidential
      # Encrypt the \`confidential\` folder to \`confidential.xbit\` file
    $ bytestash encrypt confidential -re chunk
      # Encrypt the \`confidential\` folder while encrypting chunks and randomising the hashes\n`,
    decrypt: `
    $ bytestash decrypt confidential.xbit
      # Decrypt the \`confidential\` enclave to the \`confidential\` folder
    $  bytestash decrypt confidential.xbit -o ./top-secret
      # Decrypt the \`confidential\` enclave to the specified folder\n`,
  };
  console.log(`  Examples:\n${msgs[type] || msgs['encrypt']}`);
}

class StashLog {
  constructor(init) {
    this.stash = [];
    this.init = init || '';
    this.maxLen = 0;
  }
  recalculate() {
    return this.stash.reduce((len, str) => (str.length > len ? str.length : len), 0);
  }
  log(title, content) {
    this.maxLen = this.maxLen || this.recalculate();
    this.maxLen = title.length > this.maxLen ? title.length : this.maxLen;
    this.stash.push({title, content});
  }
  print() {
    return this.stash
      .map(
        log =>
          `${log.title.padStart(log.content ? this.maxLen + 2 : this.maxLen + 3 + log.title.length / 2)}${
            log.content ? ` : ${log.content}` : ''
          }`
      )
      .join('\n');
  }
}

function getLogMethod(stasher, context) {
  if (context.log) {
    stasher.log('Log File', context.log);
    stasher.log(
      'Log Method',
      (!context.verbose && 'Normal') || (context.verbose == 1 && 'Verbose') || (context.verbose == 2 && 'ExtraVerbose')
    );
  }
}

function runEncryptFromCli(files, args) {
  let stasher = new StashLog();
  stasher.log('');
  stasher.log('Encryption Details');
  stasher.log('------------------');
  stasher.log('Action', 'Encryption');
  stasher.log('Input File', files);
  stasher.log('Output File', args.out);
  stasher.log('Password', args.password);
  stasher.log('Randomly Hash', `${!!args.randomHash}`);
  getLogMethod(stasher, args.parent);
  let encryptBy;
  if (args.encryptBy) {
    if (['chunk', 'chunks'].includes(args.encryptBy.toLowerCase())) encryptBy = 'chunks';
    else if (args.encryptBy.toLowerCase() == 'archive') encryptBy = 'archive';
    else throw Error(`Encryption method is invalid: ${args.encryptBy}`);
    stasher.log('Encrypting Method', encryptBy);
  }
  stasher.log('Export', `${!!args.export}`);
  if (args.export) stasher.log('Export file', (args.export === true && 'exported.zip') || args.export);
  stasher.log('Colorize', `${args.parent.color}`);
  stasher.log('Use *.xbit extension', `${args.xbit}`);
  stasher.log('');
  console.log(stasher.print());
}

function runDecryptFromCli(files, args) {
  let stasher = new StashLog();
  stasher.log('');
  stasher.log('Decryption Details');
  stasher.log('------------------');
  stasher.log('Action', 'Decryption');
  stasher.log('Input File', files);
  stasher.log('Output File', args.out);
  getLogMethod(stasher, args.parent);
  stasher.log('Password', args.password);
  stasher.log('Colorize', args.parent.color);
  stasher.log('');
  console.log(stasher.print());
}

module.exports = function(bytestash, encryptionHandle = runEncryptFromCli, decryptionHandle = runDecryptFromCli) {
  attachMain(commander, bytestash);
  attachEncrypt(commander, encryptionHandle);
  attachDecrypt(commander, decryptionHandle);
  commander.on('--help', showExamples);
  commander.parse(bytestash.argv);
};
