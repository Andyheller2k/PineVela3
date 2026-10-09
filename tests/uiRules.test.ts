import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Structural coverage complements actual viewport, focus and theme tests.
// These checks do not establish compliance with every usability heuristic.
const directory = join(process.cwd(), 'src/components');
const files = readdirSync(directory).filter(name => name.endsWith('.tsx'));

test('Every component exposes names for fields and icon buttons, and keyboard access for click surfaces', () => {
  const failures: string[] = [];
  let fields = 0, buttons = 0, surfaces = 0;
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(join(directory, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const report = (node: ts.Node, reason: string) => failures.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${reason}`);
    const attrs = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(source), attribute.initializer?.getText(source) || '']));
    const contentHasName = (node: ts.Node): boolean => {
      if (ts.isJsxText(node)) return Boolean(node.text.trim());
      if (ts.isJsxExpression(node) && node.expression) return true;
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && attrs(node).has('alt')) return true;
      let named = false;
      ts.forEachChild(node, child => { if (contentHasName(child)) named = true; });
      return named;
    };
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source), attributes = attrs(node);
        if (tag === 'button') {
          buttons++;
          if (!attributes.has('aria-label') && !attributes.has('aria-labelledby') && !attributes.has('title') && !(ts.isJsxElement(node.parent) && node.parent.children.some(contentHasName))) report(node, 'button has no accessible name');
        }
        if (['input', 'select', 'textarea'].includes(tag) && !['"hidden"', '"file"'].includes(attributes.get('type') || '')) {
          fields++;
          let ancestor: ts.Node | undefined = node.parent;
          let inLabel = false;
          while (ancestor) { if (ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(source) === 'label') inLabel = true; ancestor = ancestor.parent; }
          if (!inLabel && !['id', 'aria-label', 'aria-labelledby'].some(name => attributes.has(name))) report(node, 'field has no label association');
        }
        if (['div', 'span', 'img', 'p'].includes(tag) && attributes.has('onClick')) {
          const click = attributes.get('onClick')!, classes = attributes.get('className') || '';
          const isBackdrop = /absolute inset-0|fixed inset-0/.test(classes);
          const onlyStopsPropagation = /^\{(?:\(e\)|e) => e\.stopPropagation\(\)\}$/.test(click);
          if (!isBackdrop && !onlyStopsPropagation) {
            surfaces++;
            if (!attributes.has('role') || !attributes.has('tabIndex') || !attributes.has('onKeyDown') || !attributes.has('aria-label')) report(node, 'click surface lacks named keyboard interaction');
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(failures, []);
  console.log(`Audited ${files.length} components, ${buttons} buttons, ${fields} fields and ${surfaces} click surfaces.`);
});
