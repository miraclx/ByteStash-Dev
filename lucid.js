let crypto = require('crypto');
let fs = require('fs'),
  progress = require('progress-stream'),
  ProgressBar = require('./libs/ProgressBar.js');

// var tmp;

let bytestash = {
  version: '1.1.0',
  algorithm: 'aes-256-cbc',
  salt(key) {
    return `bytestash:${this.algorithm}@${key}`;
  },
};

function encrypt(input, key) {
  return new Promise(function(res, rej) {
    try {
      var keyBuf = Buffer.from(crypto.pbkdf2Sync(key, bytestash.salt(key), 100000, 16, 'sha512'));
      var cipher = crypto.createCipher(bytestash.algorithm, keyBuf);
      res(Buffer.concat([cipher.update(Buffer.from(input, 'utf8')), cipher.final()]));
    } catch (err) {
      rej(err);
    }
  });
}

function decrypt(input, key) {
  return new Promise(function(res, rej) {
    try {
      var keyBuf = Buffer.from(crypto.pbkdf2Sync(key, bytestash.salt(key), 100000, 16, 'sha512'));
      var cipher = crypto.createDecipher(bytestash.algorithm, keyBuf);
      res(Buffer.concat([cipher.update(Buffer.from(input, 'utf8')), cipher.final()]));
    } catch (err) {
      rej(err);
    }
  });
}

function encryptFile({inputPath, outputPath = `${inputPath}.xbit`, key, barStream}) {
  return new Promise((resolve, reject) => {
    if (!key) return console.log('No passkey provided, try again with one');

    var size = fs.statSync(inputPath).size;

    var keyBuf = Buffer.from(key);

    var inputStream = fs.createReadStream(inputPath);
    var outputStream = fs.createWriteStream(outputPath);
    var cipher = crypto.createCipher(bytestash.algorithm, keyBuf);

    barStream = (barStream || ProgressBar.stream('Encrypting', {progress: {length: size}}))
      .on('start', bar => {
        bar.log(`[~] Encrypting ${inputPath}`);
      })
      .on('complete', (bar, through) => {
        bar.log(`[+] Successfully encrypted ${inputPath}`);
        if (!bar.opts.clear) through.emit('progress', through.progress());
        bar.end();
        return resolve(outputPath);
      })
      .on('error', reject);

    inputStream
      .pipe(cipher)
      .pipe(barStream)
      .pipe(outputStream);
  });
}

function decryptFile({
  inputPath,
  // eslint-disable-next-line no-undef
  outputPath = `${('xbit' == (_ = inputPath.split('.')).pop() && _.join('.')) || `${inputPath}.parsed`}`,
  key,
  barStream,
}) {
  return new Promise((resolve, reject) => {
    if (!key) return console.log('No passkey provided, try again with one');

    var size = fs.statSync(inputPath).size;

    var keyBuf = Buffer.from(key);

    var inputStream = fs.createReadStream(inputPath);
    var outputStream = fs.createWriteStream(outputPath);
    var cipher = crypto.createDecipher(bytestash.algorithm, keyBuf);

    barStream = barStream || ProgressBar.stream('Decrypting', {progress: {length: size}});
    barStream
      .on('start', bar => {
        bar.log(`[~] Decrypting ${inputPath}`);
      })
      .on('complete', (bar, through) => {
        bar.log(`[+] Successfully decrypted ${inputPath}`);
        if (!bar.opts.clear) through.emit('progress', through.progress());
        bar.end();
        return resolve(outputPath);
      })
      .on('error', reject);

    inputStream
      .pipe(cipher)
      .pipe(barStream)
      .pipe(outputStream);
  });
}

function performAction(action, key) {
  console.log(bytestash.salt(key));
  key = hashKey(key);
  console.log(action, key.toString('hex'), key.toString('hex').length);
  // process.exit();
  if (action == 'encrypt')
    encryptFile({inputPath: './Mr.RobotS01E01.zip', outputPath: './lucid_results/Mr.RobotS01E01.xbit', key});
  else if (action == 'decrypt')
    decryptFile({inputPath: './lucid_results/Mr.RobotS01E01.xbit', outputPath: './lucid_results/Mr.RobotS01E01.zip', key});
  else throw new Error('action should be of value <encrypt> or <decrypt>');
}

function hashKey(key) {
  return crypto.pbkdf2Sync(key, bytestash.salt(key), 100000, 18, 'sha512');
}

function getAction() {
  return process.argv.includes('decrypt') ? 'decrypt' : 'encrypt';
}

// performAction(getAction(), '#Mira2mira');

module.exports = {
  encrypt,
  decrypt,
  encryptFile,
  decryptFile,
  hashKey,
};
