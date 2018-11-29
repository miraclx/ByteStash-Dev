let {encrypt, encryptFile, decrypt, decryptFile, hashKey} = require('../lucid');

function exec(fn, passOn, keyIndex, totalLength, namespace, ...args) {
  if (!args.every(v => v !== undefined)) throw new Error('Please complete the argument list');
  let [inEncoding, outEncoding] = args.splice(totalLength, Infinity)[0].split(/[-:,]/);
  args[0] = Buffer.from(args[0], inEncoding || 'ascii');
  args[keyIndex] = hashKey(args[keyIndex], namespace).toString('hex');
  let result = fn(...args).toString(outEncoding || 'ascii');
  if (passOn) return result;
}

const [namespace, password, encoding] = ['docrypt', 'passsword', 'utf8,utf8'];

let engine = {
  encrypt: [exec, [encrypt, true, 1, 2, namespace], [, password, encoding]],
  decrypt: [exec, [decrypt, true, 1, 2, namespace], [, password, encoding]],
  encryptFile: [exec, [encryptFile, false, 2, 3, namespace], [, , password, encoding]],
  decryptFile: [exec, [decryptFile, false, 2, 3, namespace], [, , password, encoding]],
};

function main(method) {
  let _input,
    input = process.argv.slice(2);
  if (input[0] in engine) [method, input] = [input[0], input.slice(1)];
  let block = engine[method];
  _input = [...block[1]];
  _input.push(...Object.assign([], block[2], input));
  console.log(method, [..._input].slice(4));
  let result = block[0].call(null, ..._input);
  if (result) console.log(`"${result}"`);
}

main('encrypt');
