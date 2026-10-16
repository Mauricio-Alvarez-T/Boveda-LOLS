import * as fs from 'fs';
import * as path from 'path';
import { cn, TAMANOS_TEXTO_PROPIOS } from './cn';

describe('cn — tamaños tipográficos propios', () => {
    it('un tamaño propio y un color de texto conviven', () => {
        expect(cn('text-caption', 'text-muted-foreground')).toBe('text-caption text-muted-foreground');
        expect(cn('text-caption font-black', 'text-muted-foreground')).toBe('text-caption font-black text-muted-foreground');
    });

    it('dos tamaños: gana el último', () => {
        expect(cn('text-caption', 'text-label')).toBe('text-label');
        expect(cn('text-caption', 'text-sm')).toBe('text-sm');
        expect(cn('text-sm', 'text-display-sm')).toBe('text-display-sm');
    });

    it('dos colores siguen resolviéndose como antes', () => {
        expect(cn('text-caption text-muted-foreground', 'text-brand-primary')).toBe('text-caption text-brand-primary');
    });

    it.each(TAMANOS_TEXTO_PROPIOS)('text-%s cuenta como tamaño, no como color', (t) => {
        expect(cn(`text-${t}`, 'text-foreground')).toBe(`text-${t} text-foreground`);
        expect(cn('text-xs', `text-${t}`)).toBe(`text-${t}`);
    });

    it('la lista calza con los --text-* del @theme de index.css', () => {
        const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
        const enCss = [...css.matchAll(/(?<![\w-])--text-([a-z0-9-]+)\s*:/g)]
            .map((m) => m[1])
            .filter((n) => !n.includes('--')); // fuera los `--line-height`
        expect([...new Set(enCss)].sort()).toEqual([...TAMANOS_TEXTO_PROPIOS].sort());
    });
});
