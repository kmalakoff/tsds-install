import Stream from 'stream';

const major = +process.versions.node.split('.')[0];
let Writable: typeof Stream.Writable;
if (major > 0) {
  Writable = Stream.Writable;
} else {
  Writable = require('readable-stream').Writable;
}

export type Callback = (lines: Buffer) => undefined;

export default function concatWritable(callback: Callback): NodeJS.WritableStream {
  const chunks = [];
  const stream = new Writable({
    write: (chunk, _encoding, next) => {
      chunks.push(chunk);
      next();
    },
  });
  stream.on('finish', () => callback(Buffer.concat(chunks.splice(0))));
  return stream;
}
