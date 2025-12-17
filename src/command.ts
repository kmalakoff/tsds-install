import spawn from 'cross-spawn-cb';
import getopts from 'getopts-compat';
import { wrap } from 'node-version-call';
import path from 'path';
import Queue from 'queue-cb';
import type { Writable } from 'stream';
import type { CommandCallback, CommandOptions } from 'tsds-lib';
import url from 'url';
import concatWritable from './lib/concatWritable.ts';

const major = +process.versions.node.split('.')[0];
const version = major > 14 ? 'local' : 'stable';
const __dirname = path.dirname(typeof __filename === 'undefined' ? url.fileURLToPath(import.meta.url) : __filename);
const dist = path.join(__dirname, '..');
const workerWrapper = wrap(path.join(dist, 'cjs', 'command.js'));

const RETRY_MAX = 40;
const RETRY_DELAY = 3000;
const RETRY_ERRORS = /.*(ETARGET|ENOTEMPTY|ENOENT|ECONNRESET).*/;

interface WritableOutput extends Writable {
  output?: string;
}

function worker(args: string[], options: CommandOptions, callback: CommandCallback): undefined {
  const cwd: string = (options.cwd as string) || process.cwd();
  const opts = getopts(args, { alias: { 'dry-run': 'd' }, boolean: ['dry-run'] });
  const filteredArgs = args.filter((arg) => arg !== '--dry-run' && arg !== '-d');

  if (opts['dry-run']) {
    console.log('Dry-run: would run npm install');
    return callback();
  }

  const queue = new Queue(1);
  let count = 1;
  function install(cb) {
    console.log(`npm install${count > 1 ? ` (${count})` : ''}`);
    const cp = spawn.crossSpawn('npm', ['install'].concat(filteredArgs), { encoding: 'utf8', cwd });
    cp.stdout.pipe(process.stdout);
    cp.stderr.pipe(process.stderr);
    const stderr = cp.stderr.pipe(
      concatWritable((output) => {
        stderr.output = output.toString();
      })
    ) as WritableOutput;
    spawn.worker(cp, { encoding: 'utf8' }, (err) => {
      if (!err) return cb();
      if (!stderr.output.match(RETRY_ERRORS)) return cb(err);
      if (++count > RETRY_MAX) return callback(new Error(`Failed to install ${path.basename(cwd)}`));
      queue.defer((cb) => setTimeout(cb, RETRY_DELAY));
      queue.defer(spawn.bind(null, 'npm', ['cache', 'clean', '-f'], { stdio: 'inherit' }));
      queue.defer(install.bind(null));
      cb();
    });
  }
  queue.defer(install.bind(null));
  queue.await(callback);
}

export default function command(args: string[], options: CommandOptions, callback: CommandCallback): undefined {
  version !== 'local' ? workerWrapper(version, args, options, callback) : worker(args, options, callback);
}
