import spawn from 'cross-spawn-cb';
import getopts from 'getopts-compat';
import { bind } from 'node-version-call';
import path from 'path';
import type { Writable } from 'stream';
import type { CommandCallback, CommandOptions } from 'tsds-lib';
import url from 'url';
import concatWritable from './lib/concatWritable.ts';

const major = +process.versions.node.split('.')[0];
const __dirname = path.dirname(typeof __filename === 'undefined' ? url.fileURLToPath(import.meta.url) : __filename);
const dist = path.join(__dirname, '..');

const RETRY_MAX = 40;
const RETRY_DELAY = 3000;
const RETRY_ERRORS = /.*(ETARGET|ENOTEMPTY|ENOENT|ECONNRESET).*/;

interface WritableOutput extends Writable {
  output?: string;
}

function run(args: string[], options: CommandOptions, callback: CommandCallback) {
  const cwd: string = (options.cwd as string) || process.cwd();
  const opts = getopts(args, { alias: { 'dry-run': 'd' }, boolean: ['dry-run'] });
  const filteredArgs = args.filter((arg) => arg !== '--dry-run' && arg !== '-d');

  if (opts['dry-run']) {
    console.log('Dry-run: would run npm install');
    return callback();
  }

  function install(attempt, cb) {
    console.log(`npm install${attempt > 1 ? ` (${attempt})` : ''}`);

    const cp = spawn.crossSpawn('npm', ['install'].concat(filteredArgs), { encoding: 'utf8', cwd });
    cp.stdout.pipe(process.stdout);
    cp.stderr.pipe(process.stderr);

    const stderr = cp.stderr.pipe(
      concatWritable((output) => {
        (stderr as WritableOutput).output = output.toString();
      })
    ) as WritableOutput;

    stderr.output = ''; // ensure defined

    spawn.worker(cp, { encoding: 'utf8' }, (err) => {
      if (!err) return cb(null, { ok: true });

      const msg = (stderr.output || '').toString();
      if (RETRY_ERRORS.test(msg)) return cb(null, { ok: false, retry: true, err });
      cb(err);
    });
  }

  function run(attempt, cb) {
    install(attempt, (err, res) => {
      if (err) return cb(err); // fatal
      if (res && res.ok) return cb(); // success
      if (!res || !res.retry) return cb(res && res.err ? res.err : new Error('Install failed'));
      if (attempt >= RETRY_MAX) return cb(new Error(`Failed to install ${path.basename(cwd)}`)); // out of attempts

      setTimeout(() => {
        spawn('npm', ['cache', 'clean', '-f'], { stdio: 'inherit', cwd }, (err) => {
          if (err) return cb(err);
          run(attempt + 1, cb); // ✅ important fix
        });
      }, RETRY_DELAY);
    });
  }

  run(1, callback);
}

const worker = major >= 20 ? run : bind('>=20', path.join(dist, 'cjs', 'command.js'), { callbacks: true });

export default function command(args: string[], options: CommandOptions, callback: CommandCallback): void {
  worker(args, options, callback);
}
