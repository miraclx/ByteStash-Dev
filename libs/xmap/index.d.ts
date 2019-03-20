import { PathLike } from "fs";

type EncodedBuffer = BufferEncoding | Buffer;

interface XMAPstring<T extends BufferEncoding> extends String { }
interface XMAPSlot<T extends EncodedBuffer> extends String { }

interface StackDefault<T extends EncodedBuffer> {
  tag: XMAPSlot<T>;
  size: number;
}

interface ChunkSpecs<T extends EncodedBuffer> extends StackDefault<T> {
  iv: XMAPSlot<T>;
  file: string;
  salt: XMAPSlot<T>;
}

interface XMAPSpecs<T extends EncodedBuffer> extends StackDefault<T> {
  key: XMAPSlot<T>;
  type: "folder" | "file";
  chunks: ChunkSpecs<T>[];
  compress: {
    id: number;
    size: number;
  }

  // EXPERIMENTAL
  layers: ChunkSpecs<T>[][];
}

type SkipSlots = Array<string>;

type Encoding<I extends EncodedBuffer, O extends EncodedBuffer> = string | { input: I, output: O };

interface XMAP<T extends EncodedBuffer> extends XMAPSpecs<T> {
  constructor: typeof XMAP;
  encode<V extends BufferEncoding>(encoding: V, skips?: SkipSlots): XMAP<V>;

  stringify(): XMAPstring<'hex'>;
  stringify<V extends BufferEncoding>(encoding: V, skips?: SkipSlots): XMAPstring<V>;
  stringify<V extends BufferEncoding>(encoding: V, JSONSpaces: Number, skips?: SkipSlots): XMAPstring<V>;

  stashChunk(chunkSpec: ChunkSpecs<T>): void;
}

declare const XMAP: {
  new(): XMAP<Buffer>;
  new <T extends EncodedBuffer>(xmapSpecs: XMAPSpecs<T>, skips?: SkipSlots): XMAP<T>;
  prototype: XMAP<Buffer>;

  parse(xmapstring: XMAPstring<'hex'>, skips?: SkipSlots): XMAP<Buffer>;
  parse<T extends BufferEncoding>(xmapstring: XMAPstring<T>, encoding: T, skips?: SkipSlots): XMAP<Buffer>;

  parseFile(xmapFile: PathLike, skips?: SkipSlots): XMAP<Buffer>;
  parseFile<T extends BufferEncoding>(xmapFile: PathLike, encoding: T, skips?: SkipSlots): XMAP<Buffer>;

  parseBuffers(xmapObject: XMAP<EncodedBuffer>, skips?: SkipSlots): XMAP<Buffer>;
  parseBuffers<I extends EncodedBuffer, O extends EncodedBuffer>(xmapObject: XMAP<I>, encoding: Encoding<I, O>, skips?: SkipSlots): XMAP<O>;
}
