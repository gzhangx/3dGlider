import {cp as copy, rm as remove, readdir, mkdir, access} from 'fs/promises';
import {existsSync} from 'fs';
import path from 'path';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const target = path.resolve(projectRoot, '..', '3dGliderWeb');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, {stdio: 'inherit', ...opts});
}

async function ensureWorktree() {
  try {
    // Try to add or update a worktree for gh-pages
    run(`git worktree add -B gh-pages "${target}"`, {cwd: projectRoot});
  } catch (err) {
    console.log('git worktree add failed, attempting clone/fallback...');
    try {
      const remote = execSync(`git -C "${projectRoot}" remote get-url origin`).toString().trim();
      if (!existsSync(target)) await mkdir(target, {recursive: true});
      run(`git clone --branch gh-pages --single-branch "${remote}" "${target}"`);
    } catch (err2) {
      console.log('Clone fallback failed — initializing an empty gh-pages branch');
      if (!existsSync(target)) await mkdir(target, {recursive: true});
      run(`git -C "${target}" init`);
      try {
        run(`git -C "${target}" checkout gh-pages`);
      } catch (e) {
        run(`git -C "${target}" checkout --orphan gh-pages`);
      }
    }
  }
}

async function clearTarget() {
  const entries = await readdir(target);
  for (const name of entries) {
    if (name === '.git') continue;
    const p = path.join(target, name);
    await remove(p, {recursive: true, force: true});
  }
}

async function copyDist() {
  const items = await readdir(distDir);
  for (const name of items) {
    const src = path.join(distDir, name);
    const dest = path.join(target, name);
    await copy(src, dest, {recursive: true});
  }
}

async function deploy() {
  try {
    await access(distDir);
  } catch (err) {
    console.error('Build output not found at', distDir);
    process.exit(1);
  }

  await ensureWorktree();
  await clearTarget();
  await copyDist();

  try {
    run(`git -C "${target}" add --all`);
    try {
      run(`git -C "${target}" commit -m "Deploy site"`);
    } catch (cErr) {
      console.log('No changes to commit.');
    }
    run(`git -C "${target}" push origin gh-pages`);
    console.log('Deployed to gh-pages branch in', target);
  } catch (err) {
    console.error('Failed to commit or push:', err.message);
    process.exit(1);
  }
}

deploy().catch(err => {
  console.error(err);
  process.exit(1);
});
