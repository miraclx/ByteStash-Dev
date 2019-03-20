import { stream } from "../progress2";
import { Transform, TransformOptions } from "stream"

export type TransformCallback = () => void

export class TransformWithMiddleWare extends Transform {
  pipeStack: Array<[() => {}, { label: string, persist: {}, callback: (error) => void }]>

  /**
   * Construct a TransformingMiddleWare
   */
  constructor(options: TransformOptions): this
  /**
   * Middleware extender, transform and manipulate the chunk streams
   * @param label Label for the middleware, useful for debugging
   * @param fn Function returning a transform stream
   * @param persist An object to hold static values for every call
   * @param callback A function to be attached to the pipeline 'finish' event
   */
  use<P extends {}>(label: string, fn: (data: any, persist: P) => NodeJS.ReadWriteStream, callback?: (error) => void, persist?: P): this
  /**
   * Middleware extender, transform and manipulate the chunk streams
   * @param label Label for the middleware, useful for debugging
   * @param fn Function returning a transform stream
   * @param persist An object to hold static values for every call
   * @param callback A function to be attached to the pipeline 'finish' event
   */
  use<P extends {}>(label: string, fn: (data: any, persist: P) => NodeJS.ReadWriteStream, persist?: P, callback?: (error) => void): this
  /**
   * Create a piped chain from all the middleware functions
   * @param reader The root readable stream
   * @param data Arguments to the pipestack function
   */
  pipeAll(reader: NodeJS.ReadableStream, ...data: any): void
}

export interface ReadChunkerSpec {
  size: number,
  length: number,
  total: number,
  appendOverflow: boolean,
}

export class ReadChunker extends TransformWithMiddleWare {
  spec = { total: number, splitSize: number, lastSplitSize: number, numberOfParts: number, }
  bytesRead: number
  constructor(spec: ReadChunkerSpec): this
  fiss(output: string | string[] | Buffer | Buffer[] | NodeJS.ReadableStream, outputManipulator: (file: string) => string): NodeJS.WritableStream
}

export class ReadMerger extends TransformWithMiddleWare {
  constructor() { }
  fuse(...src: NodeJS.ReadableStream[]): NodeJS.ReadableStream
  fuse(...src: Array<any, NodeJS.ReadableStream>[]): NodeJS.ReadableStream
}
