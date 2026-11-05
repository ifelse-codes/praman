import { createHash } from 'node:crypto';
import { cpSync, readdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

/** Copy source bytes, while explicitly sharing installed dependencies rather than pretending hermeticity. */
export function snapshotSource(source: string, destination: string, excluded: readonly string[]) {
  const ignored = new Set(['node_modules', '.git', '.env', '.DS_Store', ...excluded]);
  const include = (name: string) => !ignored.has(name) && !name.startsWith('.env.');
  cpSync(source, destination, { recursive: true, filter: path => include(basename(path)) });
  const dependencyRoots: string[] = [];
  function linkDependencies(from: string, to: string) {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        const dependencies = realpathSync(join(from, entry.name));
        symlinkSync(dependencies, join(to, entry.name), 'dir');
        dependencyRoots.push(dependencies);
      } else if (entry.isDirectory() && include(entry.name)) linkDependencies(join(from, entry.name), join(to, entry.name));
    }
  }
  linkDependencies(source, destination);
  return dependencyRoots;
}

export function hashSource(directory: string, excluded: readonly string[]) {
  const ignored = new Set(['node_modules', '.git', '.env', '.DS_Store', ...excluded]);
  const hash = createHash('sha256');
  function visit(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignored.has(entry.name) || entry.name.startsWith('.env.')) continue;
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) hash.update(relative(directory, file)).update('\0').update(readFileSync(file)).update('\0');
      else throw new Error(`Unsupported source entry: ${file}`);
    }
  }
  visit(directory);
  return hash.digest('hex');
}

/** Bundlers resolving workspace symlinks must cover their real targets, not only the source checkout. */
export function sharedSourceRoot(paths: string[]) {
  const roots = paths.map(path => realpathSync(path));
  let root = dirname(roots[0]);
  while (roots.some(path => path !== root && !path.startsWith(root + sep)) && dirname(root) !== root) root = dirname(root);
  if (dirname(root) === root) throw new Error('Source snapshots and installed dependencies require a shared non-root filesystem ancestor');
  return root;
}
