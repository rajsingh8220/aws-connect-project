import * as fs from 'fs';
import * as path from 'path';

/** Walk up from current file until we find the repo root (contact_flows/ exists). */
export function findProjectRoot(): string {
  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, 'contact_flows'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate project root (contact_flows/ missing)');
    }
    dir = parent;
  }
  return dir;
}

export function projectPath(...segments: string[]): string {
  return path.join(findProjectRoot(), ...segments);
}
