#!/bin/env node
let commander = require('commander');

let bytestash = {
  version: '1.0.0',
  author: {
    name: 'Miraculous Owonubi',
    email: 'omiraculous@gmail.com',
  },
  year: 2018,
  tagHeader() {
    return `ByteStash v${this.version} (c) ${this.year} ${this.author.name} <${this.author.email}>`;
  },
};

commander
  .version(`ByteStash v${bytestash.version}`)
  // .description(bytestash.tagHeader())
  .usage('[commands] [options]')
  .option('-l, --log [file]', 'log the output to file', 'compile.log')
  .option('-v, --verbose', 'be Verbose Incremental (-vv will include hashes (Not recommended))', (...[, v]) => v <= 2 && v + 1, 0)
  .option('--no-color', 'Do not output with any colors', false);

commander
  .command('encrypt <file...>')
  .alias('e')
  .option('-e, --encrypt-by <method>', 'Method to perform encryption [chunk|archive]', 'archive')
  .option('-h, --hash [key]', 'Use a hash for each chunk encryption ::Specifyable (Only compatible with `-e chunks`)', false)
  .option('-o, --output <archive path>', 'specify the path of the output archive', '<filename>')
  .option('-p, --password <password>', 'collect the password from the args (Not recommended)', '<query>')
  .option('-r, --random-hash', 'use random hashes for each chunk (Only compatible with `-e chunks`)', false)
  .option('-x, --export [file]', 'export the keys and un-encrypted structuring to the file (Not recommended)')
  .option('--no-xbit', 'do not force the *.xbit extension on the archive')
  .on('--help', showExamples.bind(null, 'encrypt'))
  .action(runEncryptFromCli);

commander
  .command('decrypt <file...>')
  .alias('d')
  .option('-o, --output <path>', 'specifify the path for the decrypted archive', '<filename>')
  .option('-p, --password <password>', 'collect the password from the args (Not recommended)', '<query>')
  .on('--help', showExamples.bind(null, 'decrypt'))
  .action(runDecryptFromCli);

function showExamples(type) {
  var msgs = {
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

function getLogMethod(stasher) {
  if (commander.log) {
    stasher.log('Log File', commander.log);
    stasher.log(
      'Log Method',
      (!commander.verbose && 'Normal') || (commander.verbose == 1 && 'Verbose') || (commander.verbose == 2 && 'ExtraVerbose')
    );
  }
}

function runEncryptFromCli(files, args) {
  var stasher = new StashLog();
  stasher.log('');
  stasher.log('Encryption Details');
  stasher.log('------------------');
  stasher.log('Action', 'Encryption');
  console.log(args);
  process.exit();
  stasher.log('Input File', args.file);
  getLogMethod(stasher);
  var encryptBy;
  if (args.encryptBy) {
    if (['chunk', 'chunks'].includes(args.encryptBy.toLowerCase())) encryptBy = 'chunks';
    else if (args.encryptBy.toLowerCase() == 'archive') encryptBy = 'archive';
    else throw Error(`Encryption method is invalid: ${args.encryptBy}`);
    stasher.log('Encrypting Method', encryptBy);
  }
  stasher.log('Output File', args.output);
  stasher.log('Password', args.password);
  stasher.log('Hash', `${args.hash}`);
  if (encryptBy === 'chunks' && args.hash) stasher.log('Random hash', `${args.randomHash}`);
  stasher.log('Export', `${!!args.export}`);
  if (args.export) stasher.log('Export file', (args.export === true && 'exported.zip') || args.export);
  stasher.log('Colorize', `${args.parent.color}`);
  stasher.log('Use *.xbit extension', `${args.xbit}`);
  stasher.log('');
  console.log(stasher.print());
}

function runDecryptFromCli(files, args) {
  var stasher = new StashLog();
  stasher.log('');
  stasher.log('Decryption Details');
  stasher.log('------------------');
  stasher.log('Action', 'Decryption');
  stasher.log('Input File', args.file);
  getLogMethod(stasher);
  stasher.log('Output File', args.output);
  stasher.log('Password', args.password);
  stasher.log('Colorize', args.parent.color);
  stasher.log('');
  console.log(stasher.print());
}

process.argv.slice(2).length && console.log(bytestash.tagHeader());
commander.on('--help', showExamples).parse(process.argv);
