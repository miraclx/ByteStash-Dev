let fs = require('fs');

let buildXMAP = objectSpecs => ({
  key: null,
  tag: null,
  size: null,
  type: null,
  compress: {
    id: null,
    size: null,
  },
  chunks: [],
  ...objectSpecs,
});

let buildChunk = chunkSpecs => ({
  iv: null,
  tag: null,
  file: null,
  salt: null,
  size: null,
  ...chunkSpecs,
});

class XMAP {
  constructor(objectSpecs) {
    Object.assign(this, buildXMAP(objectSpecs));
  }

  encode(encoding, skipSlots) {
    return new XMAP(
      XMAP.parseBuffers(
        { ...this, chunks: this.chunks.map(chunk => XMAP.parseBuffers({ ...chunk }, encoding, skipSlots)) },
        encoding,
        skipSlots
      )
    );
  }

  stringify(encoding = 'hex', JSONSpaces, skipSlots) {
    if (Array.isArray(JSONSpaces)) [JSONSpaces, skipSlots] = [null, JSONSpaces];
    return JSON.stringify(this.encode(encoding, skipSlots), null, JSONSpaces);
  }

  stashChunk(objectSpecs) {
    this.chunks.push(buildChunk(objectSpecs));
  }

  static parse(xmapString, encoding, skipSlots) {
    return new XMAP(JSON.parse(xmapString), skipSlots).encode(encoding);
  }

  static parseFile(xmapFile, encoding, skipSlots) {
    return this.parse(fs.readFileSync(xmapFile).toString(), encoding, skipSlots);
  }

  static parseBuffers(object, encoding, skipSlots = []) {
    if (Array.isArray(encoding)) [encoding, skipSlots] = [null, encoding];
    let { input, output } = { input: 'hex', output: Buffer.isEncoding(encoding) ? encoding : null, ...encoding };
    for (let slot of ['iv', 'key', 'tag', 'salt'].filter(v => v in object && object[v] && !skipSlots.includes(v)))
      if (((object[slot] = Buffer.from(object[slot], input)), output)) object[slot] = object[slot].toString(output);
    return object;
  }
}

module.exports = { XMAP };
