import {cp as copy, rm as remove, readdir, mkdir, access, readFile, writeFile} from 'fs/promises';
import {existsSync} from 'fs';
import path from 'path';
import {execSync} from 'child_process';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const target = path.resolve(projectRoot, '..', '3dGliderWeb');
const targetRepo = process.env.TARGET_REPO || 'git@github.com:gzhangx/3dGliderWeb.git';

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, {stdio: 'inherit', ...opts});
}

async function ensureTargetRepo() {
  try {
    if (!existsSync(target)) {
      try {
        run(`git clone --branch gh-pages --single-branch "${targetRepo}" "${target}"`);
      } catch (e) {
        run(`git clone "${targetRepo}" "${target}"`);
      }
    }

    if (!existsSync(path.join(target, '.git'))) {
      run(`git -C "${target}" init`);
      run(`git -C "${target}" remote add origin "${targetRepo}"`);
    } else {
      try {
        run(`git -C "${target}" remote get-url origin`);
        run(`git -C "${target}" remote set-url origin "${targetRepo}"`);
      } catch (e) {
        run(`git -C "${target}" remote add origin "${targetRepo}"`);
      }
      run(`git -C "${target}" fetch origin --prune`);
    }

    try {
      run(`git -C "${target}" checkout gh-pages`);
      run(`git -C "${target}" pull origin gh-pages`);
    } catch (e) {
      run(`git -C "${target}" checkout --orphan gh-pages`);
      run(`git -C "${target}" rm -rf . || true`);
    }
  } catch (err) {
    console.error('Failed to prepare target repo:', err.message || err);
    process.exit(1);
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

async function patchIndexHtml() {
  const indexPath = path.join(target, 'index.html');
  try {
    let contents = await readFile(indexPath, 'utf8');
    const updated = contents
      .replace(/\/3dGlider\//g, '/3dGliderWeb/')
      .replace(/href="\/vite\.svg"/g, 'href="/3dGliderWeb/vite.svg"')
      .replace(/src="\/vite\.svg"/g, 'src="/3dGliderWeb/vite.svg"');
    if (updated !== contents) {
      await writeFile(indexPath, updated, 'utf8');
      console.log('Patched index.html for 3dGliderWeb paths');
    }
  } catch (err) {
    console.warn('Warning: could not patch index.html:', err.message || err);
  }
}

async function deploy() {
  try {
    await access(distDir);
  } catch (err) {
    console.error('Build output not found at', distDir);
    process.exit(1);
  }

  await ensureTargetRepo();
  await clearTarget();
  await copyDist();
  await patchIndexHtml();

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
