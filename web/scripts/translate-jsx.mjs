import path from 'node:path';

// Keep translation at React render boundaries. API payloads and application state stay untouched.
export default function translateJSX({ types: t }) {
  return {
    name: 'dofiin-vietnamese-display',
    visitor: {
      Program: {
        enter(program, state) {
          state.viEnabled = /[/\\]src[/\\]/.test(state.filename || '') && !/[/\\]i18n\.tsx$/.test(state.filename || '');
          state.viUsed = false;
        },
        exit(program, state) {
          if (!state.viUsed) return;
          let relative = path.relative(path.dirname(state.filename), path.join(path.dirname(state.filename.split(/[/\\]src[/\\]/)[0]), 'src/i18n'));
          // All current UI files are in src; support nested components as well.
          const sourceRoot = state.filename.split(/[/\\]src[/\\]/)[0];
          relative = path.relative(path.dirname(state.filename), path.join(sourceRoot, 'src', 'i18n')).replaceAll('\\', '/');
          if (!relative.startsWith('.')) relative = './' + relative;
          program.unshiftContainer('body', t.importDeclaration([
            t.importSpecifier(t.identifier('__vi'), t.identifier('translateNode')),
          ], t.stringLiteral(relative)));
        },
      },
      JSXText(nodePath, state) {
        if (!state.viEnabled) return;
        const text = nodePath.node.value.replace(/\s+/g, ' ');
        if (!text.trim()) return;
        state.viUsed = true;
        nodePath.replaceWith(t.jsxExpressionContainer(t.callExpression(t.identifier('__vi'), [t.stringLiteral(text)])));
      },
      JSXExpressionContainer(nodePath, state) {
        if (!state.viEnabled || t.isJSXEmptyExpression(nodePath.node.expression)) return;
        const parent = nodePath.parentPath;
        if (parent.isJSXAttribute()) {
          const name = parent.node.name.name;
          if (!['title', 'placeholder', 'aria-label', 'alt', 'label', 'subtitle'].includes(name)) return;
        }
        const expression = nodePath.node.expression;
        if (t.isJSXElement(expression) || t.isJSXFragment(expression) ||
            (t.isCallExpression(expression) && t.isIdentifier(expression.callee, { name: '__vi' }))) return;
        state.viUsed = true;
        nodePath.get('expression').replaceWith(t.callExpression(t.identifier('__vi'), [expression]));
      },
      JSXAttribute(nodePath, state) {
        if (!state.viEnabled || !['title', 'placeholder', 'aria-label', 'alt', 'label', 'subtitle'].includes(nodePath.node.name.name)) return;
        if (!t.isStringLiteral(nodePath.node.value)) return;
        state.viUsed = true;
        nodePath.node.value = t.jsxExpressionContainer(t.callExpression(t.identifier('__vi'), [t.stringLiteral(nodePath.node.value.value)]));
      },
    },
  };
}
