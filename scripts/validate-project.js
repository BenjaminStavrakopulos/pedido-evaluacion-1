const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const htmlRoots = [projectRoot, path.join(projectRoot, 'admin'), path.join(projectRoot, 'tools')];
const ignoredDirectories = new Set(['node_modules', 'load-tests']);

function getFiles(root, extension) {
    if (!fs.existsSync(root)) return [];

    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(root, entry.name);
        if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
            return getFiles(filePath, extension);
        }
        return entry.isFile() && path.extname(entry.name).toLowerCase() === extension
            ? [filePath]
            : [];
    });
}

function normalizeLocalPath(value) {
    return value.split('?')[0].split('#')[0];
}

function isExternalReference(value) {
    return /^(?:[a-z]+:|\/\/|#|data:|mailto:|tel:)/i.test(value);
}

function validateHtmlReferences(htmlFiles) {
    const errors = [];
    const inlineScriptPattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i;

    for (const htmlFile of htmlFiles) {
        const content = fs.readFileSync(htmlFile, 'utf8');
        const relativeHtmlPath = path.relative(projectRoot, htmlFile);

        if (inlineScriptPattern.test(content)) {
            errors.push(`${relativeHtmlPath}: contiene un script inline`);
        }

        const references = [
            ...Array.from(content.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi), (match) => match[1]),
            ...Array.from(content.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css[^"']*)["']/gi), (match) => match[1])
        ];

        for (const reference of references) {
            if (isExternalReference(reference)) continue;

            const cleanReference = normalizeLocalPath(reference);
            const resolvedPath = path.resolve(path.dirname(htmlFile), cleanReference);
            if (!fs.existsSync(resolvedPath)) {
                errors.push(`${relativeHtmlPath}: referencia local no encontrada -> ${reference}`);
            }
        }
    }

    return errors;
}

function validateJavaScriptSyntax(jsFiles) {
    const errors = [];

    for (const jsFile of jsFiles) {
        try {
            execFileSync(process.execPath, ['--check', jsFile], { stdio: 'ignore' });
        } catch (_) {
            errors.push(`${path.relative(projectRoot, jsFile)}: sintaxis JavaScript invalida`);
        }
    }

    return errors;
}

function run() {
    const htmlFiles = htmlRoots.flatMap((root) => getFiles(root, '.html'));
    const jsFiles = getFiles(path.join(projectRoot, 'js'), '.js');
    const errors = [
        ...validateHtmlReferences(htmlFiles),
        ...validateJavaScriptSyntax(jsFiles)
    ];

    if (errors.length > 0) {
        console.error('Validacion del proyecto fallo:');
        errors.forEach((error) => console.error(` - ${error}`));
        process.exit(1);
    }

    console.log(`Validacion OK: ${htmlFiles.length} HTML y ${jsFiles.length} JS revisados.`);
}

run();
