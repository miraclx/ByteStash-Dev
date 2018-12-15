// AES Encryption/Decryption with AES-256-GCM using random Initialization Vector + Salt
// ----------------------------------------------------------------------------------------
// the encrypted datablock is base64 encoded for easy data exchange.
// if you have the option to store data binary save consider to remove the encoding to reduce storage size
// ----------------------------------------------------------------------------------------
// format of encrypted data - used by this example. not an official format
//
// +--------------------+-----------------------+----------------+----------------+
// | SALT               | Initialization Vector | Auth Tag       | Payload        |
// | Used to derive key | AES GCM XOR Init      | Data Integrity | Encrypted Data |
// | 64 Bytes, random   | 16 Bytes, random      | 16 Bytes       | (N-96) Bytes   |
// +--------------------+-----------------------+----------------+----------------+
//
// ----------------------------------------------------------------------------------------
// Input/Output Vars
//
// MASTERKEY: the key used for encryption/decryption.
//            it has to be cryptographic safe - this means randomBytes or derived by pbkdf2 (for example)
// TEXT:      data (utf8 string) which should be encoded. modify the code to use Buffer for binary data!
// ENCDATA:   encrypted data as base64 string (format mentioned on top)

// load the build-in crypto functions
let crypto = require('crypto');

// encrypt/decrypt functions
module.exports = {
  /**
   * Encrypts text by given key
   * @param String text to encrypt
   * @param Buffer masterkey
   * @returns String encrypted text, base64 encoded
   */
  encrypt: function(text, masterkey) {
    try {
      // random initialization vector
      let iv = crypto.randomBytes(16);

      // random salt
      let salt = crypto.randomBytes(64);

      // derive key: 32 byte key length - in assumption the masterkey is a cryptographic and NOT a password there is no need for
      // a large number of iterations. It may can replaced by HKDF
      let key = crypto.pbkdf2Sync(masterkey, salt, 2145, 32, 'sha512');

      // AES 256 GCM Mode
      let cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

      // encrypt the given text
      let encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

      // extract the auth tag
      let tag = cipher.getAuthTag();

      // generate output
      return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
    } catch (e) {}

    // error
    return null;
  },

  /**
   * Decrypts text by given key
   * @param String base64 encoded input data
   * @param Buffer masterkey
   * @returns String decrypted (original) text
   */
  decrypt: function(data, masterkey) {
    try {
      // base64 decoding
      let bData = new Buffer.from(data, 'base64');

      // convert data to buffers
      let salt = bData.slice(0, 64);
      let iv = bData.slice(64, 80);
      let tag = bData.slice(80, 96);
      let text = bData.slice(96);

      // derive key using; 32 byte key length
      let key = crypto.pbkdf2Sync(masterkey, salt, 2145, 32, 'sha512');

      // AES 256 GCM Mode
      let decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      // encrypt the given text
      let decrypted = decipher.update(text, 'binary', 'utf8') + decipher.final('utf8');

      return decrypted;
    } catch (e) {}

    // error
    return null;
  },
};
