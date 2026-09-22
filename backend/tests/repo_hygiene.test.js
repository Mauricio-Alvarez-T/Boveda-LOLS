/**
 * Higiene del repo (plan Gestiones B1, 2026-09-11).
 *
 * El repo es PÚBLICO. `backend/uploads/` contiene documentos de trabajadores (PDF/TXT
 * nombrados por RUT) y NUNCA debe versionarse: el servidor los preserva fuera del deploy
 * (`rsync --exclude 'uploads/'` en scripts/cpanel-deploy-*.sh). Hasta el 2026-09-11 había
 * 37 archivos trackeados; se des-versionaron con `git rm -r --cached` + `.gitignore`.
 * Este test falla si alguien los vuelve a agregar. Si `git` no está disponible (tarball
 * sin .git), se omite.
 */
const { execSync } = require('child_process');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');

function gitLsFiles(rel) {
    try {
        return execSync(`git ls-files ${rel}`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().split(/\r?\n/).filter(Boolean);
    } catch {
        return null; // sin git
    }
}

describe('higiene del repo público', () => {
    const tracked = gitLsFiles('backend/uploads');
    const maybe = tracked === null ? test.skip : test;

    maybe('backend/uploads/ no tiene archivos versionados', () => {
        expect(tracked).toEqual([]);
    });

    test('.gitignore excluye backend/uploads/', () => {
        const fs = require('fs');
        const gi = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
        expect(gi).toMatch(/^backend\/uploads\/$/m);
    });
});
