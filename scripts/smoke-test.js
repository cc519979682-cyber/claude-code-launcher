const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'package.json',
  'src/main.js',
  'src/preload.js',
  'src/renderer/index.html',
  'src/renderer/styles.css',
  'src/renderer/app.js'
];

for (const file of requiredFiles) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

for (const file of ['src/main.js', 'src/preload.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  new Function(source);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const dependency of ['electron', '@xterm/xterm', '@xterm/addon-fit', '@homebridge/node-pty-prebuilt-multiarch']) {
  if (!packageJson.dependencies[dependency]) {
    throw new Error(`Missing dependency: ${dependency}`);
  }
}

console.log('smoke ok');
