import { randomBytes, createHash, Hash } from "crypto"

type XMAPSlot = string | Buffer

interface StackDefault {
  tag: XMAPSlot;
  hash: string;
  size: number;
}

interface XMAPSpecs extends StackDefault {
  key: XMAPSlot;
  type: 0 | 1;
  compression: 0 | 1 | 2;
}

interface ChunkSpecs extends StackDefault {
  iv: XMAPSlot;
  file: string;
  next: string | null;
  parent: XMAPSpecs;
}

interface ChunkFile {
  meta: ChunkSpecs
  stream: NodeJS.ReadWriteStream;
}

let parent: XMAPSpecs = {
  key: randomBytes(32).toString('hex'),
  tag: randomBytes(16).toString('hex'),
  hash: randomBytes(16).toString('hex'),
  size: 1024,
  type: 0,
  compression: 1,
}

let chunk: ChunkFile = {
  meta: {
    parent,
    iv: randomBytes(16).toString('hex'),
    tag: randomBytes(16).toString('hex'),
    hash: randomBytes(16).toString('hex'),
    next: "<file>.xpart",
    file: `${randomBytes(32).toString('hex')}.xpart`,
    size: 1024,
  },
  stream: null,
}

console.log(chunk);

/**
{
  meta: {
    parent: {
      key: "c178782d18bc8e66bca53c784291871df21d4dafd5aed8ece22efb52493cfa65",
      tag: "ddb2351d1623cc61648fe1287e87efbe",
      hash: "94642465383b5dacd7f164c9b61111f0",
      size: 243633,
      type: 0,
      compression: 1,
    },
    iv: "17ae9bf0bc11397c7988151300033989",
    tag: "e3a6f8f74ecfb080908bf85db832ef76",
    hash: "8c905ee807629fdc993e8904feb5288d",
    next: "d898682ef2256ced7d4867a6d2fa901c5a2344a27864838e228e5ef456356c40.xpart",
    file: "770aa4cd2490070fc9ffcb9907889864839f296a6e069f75c5bedfabbe6085b9.xpart",
    size: 2436,
  }
}
*/

/**
 * [First File, IV, SALT]
 * [[THIS DATA], [PARENT DATA]] => <N Bytes>
 * [ENCRYPTED CONTENT] => <Infinity Bytes>
 */

/**
 * K[init:salt] = 'bytestash
 * take first file, extract its encrypted meta = [1:eMeta]
 * take user password = [1:eMeta{salt}]
 * decrypt [1:eMeta] = [1:Meta]
 * [1:Meta] Contains data for decryption of [1:eContent] into [1:Content]
 * md5 hashing of [1:Meta] = [2:eMeta{IV}]
 * decrypt [2:eMeta] = []
 */
