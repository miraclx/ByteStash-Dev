let crypto = require('crypto');
let fs = require('fs');

let bytestash = {
  version: '1.1.0',
  algorithm: 'aes-256-cbc',
  salt(key, namespace) {
    return `bytestash@${namespace}:${key}`;
  },
};

function encrypt(input, key) {
  var keyBuf = Buffer.from(crypto.pbkdf2Sync(key, bytestash.salt(key), 100000, 16, 'sha512'));
  var cipher = crypto.Cipher(bytestash.algorithm, keyBuf);
  return Buffer.concat([cipher.update(Buffer.from(input, 'utf8')), cipher.final()]);
}

function decrypt(input, key) {
  var keyBuf = Buffer.from(crypto.pbkdf2Sync(key, bytestash.salt(key), 100000, 16, 'sha512'));
  var cipher = crypto.Decipher(bytestash.algorithm, keyBuf);
  return Buffer.concat([cipher.update(Buffer.from(input, 'utf8')), cipher.final()]);
}

function encryptFile(inputPath, outputPath = `${inputPath}.xbit`, key) {
  if (!key) return console.log('No passkey provided, try again with one');

  var keyBuf = Buffer.from(key);

  var inputStream = fs.createReadStream(inputPath);
  var outputStream = fs.createWriteStream(outputPath);
  var cipher = crypto.Cipher(bytestash.algorithm, keyBuf);

  return inputStream.pipe(cipher).pipe(outputStream);
}

function decryptFile(inputPath, outputPath, key) {
  outputPath = outputPath || `${('xbit' == (_ = inputPath.split('.')).pop() && _.join('.')) || `${inputPath}.parsed`}`;
  if (!key) return console.log('No passkey provided, try again with one');

  var keyBuf = Buffer.from(key);

  var inputStream = fs.createReadStream(inputPath);
  var outputStream = fs.createWriteStream(outputPath);
  var cipher = crypto.Decipher(bytestash.algorithm, keyBuf);

  return inputStream.pipe(cipher).pipe(outputStream);
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

function hashKey(key, namespace) {
  return crypto.pbkdf2Sync(key, bytestash.salt(key, namespace), 100000, 32, 'sha512');
}

module.exports = {
  encrypt,
  decrypt,
  encryptFile,
  decryptFile,
  hashKey,
};
