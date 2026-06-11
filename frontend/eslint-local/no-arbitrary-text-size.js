/**
 * Regla ESLint local (Design System, Fase 2) — sin dependencias npm nuevas.
 *
 * Desincentiva tamaños de fuente arbitrarios `text-[Npx]` en className.
 * Usar los tokens semánticos (text-micro/caption/label/section) o las escalas
 * de Tailwind (text-xs/sm/base/lg). Ver docs/reglas/diseno.md.
 *
 * Built-in `no-restricted-syntax` no puede regexear el contenido del string;
 * por eso esta regla mínima inspecciona el valor de className (Literal y
 * template strings).
 */

const ARBITRARY_TEXT_RE = /\btext-\[\d+(?:\.\d+)?(px|rem|em)\]/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
    meta: {
        type: 'suggestion',
        docs: { description: 'Prohíbe tamaños de fuente arbitrarios text-[Npx]; usa tokens del design system.' },
        schema: [],
        messages: {
            arbitrary: "No uses tamaños de fuente arbitrarios ('{{match}}'). Usa text-micro/caption/label/section o text-xs/sm/lg (ver docs/reglas/diseno.md).",
        },
    },
    create(context) {
        function check(node, raw) {
            const m = raw && raw.match(ARBITRARY_TEXT_RE);
            if (m) context.report({ node, messageId: 'arbitrary', data: { match: m[0] } });
        }
        return {
            JSXAttribute(node) {
                if (!node.name || node.name.name !== 'className' || !node.value) return;
                const v = node.value;
                if (v.type === 'Literal' && typeof v.value === 'string') {
                    check(v, v.value);
                } else if (v.type === 'JSXExpressionContainer') {
                    const expr = v.expression;
                    if (expr.type === 'Literal' && typeof expr.value === 'string') {
                        check(expr, expr.value);
                    } else if (expr.type === 'TemplateLiteral') {
                        for (const q of expr.quasis) check(q, q.value.raw);
                    }
                }
            },
        };
    },
};
