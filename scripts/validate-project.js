const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function javascriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            return javascriptFiles(file);
        }
        return entry.isFile() && entry.name.endsWith('.js') ? [file] : [];
    });
}

const required = [
    'backend/server.js', 'backend/Dockerfile', 'backend/package-lock.json',
    'emulator/Dockerfile', 'emulator/firebase.json', 'emulator/package-lock.json',
    'compose.yaml', '.github/workflows/ci.yml', '.github/dependabot.yml'
];
const errors = [];
for (const name of required) {
    if (!fs.existsSync(path.join(root, name))) errors.push(`Falta ${name}`);
}
for (const name of ['.firebaserc', 'firebase.json', 'js', 'backend/services']) {
    if (fs.existsSync(path.join(root, name))) errors.push(`Contenido real/heredado no permitido: ${name}`);
}
const files = ['backend', 'scripts'].flatMap(directory => javascriptFiles(path.join(root, directory)));
for (const file of files) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
        errors.push(`${path.relative(root, file)}: ${error.stderr?.toString() || error.message}`);
    }
}
if (errors.length) {
    console.error(`Validacion fallo:\n${errors.join('\n')}`);
    process.exit(1);
}
console.log(`Validacion OK: ${files.length} archivos JavaScript y estructura aislada.`);
