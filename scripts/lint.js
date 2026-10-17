// Cek sintaks seluruh berkas JavaScript (api/, public/, server.js). Pakai: npm run lint
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['api', 'public', 'scripts', 'server.js'];
const files = [];
roots.forEach((r) => (function walk(p) {
    if (!fs.existsSync(p)) return;
    if (fs.statSync(p).isDirectory()) return fs.readdirSync(p).forEach((f) => walk(path.join(p, f)));
    if (p.endsWith('.js')) files.push(p);
})(r));

let bad = 0;
files.forEach((f) => {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) { bad++; console.error('GAGAL: ' + f + '\n' + r.stderr); }
});
console.log(files.length + ' berkas diperiksa, ' + bad + ' gagal.');
process.exit(bad ? 1 : 0);
