import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
const declarations = (block: string) => Object.fromEntries(
  [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()])
);
const light = declarations(css.match(/:root \{([\s\S]*?)\n\}/)![1]);
const dark = { ...light, ...declarations(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)![1]) };
const experience = readFileSync(new URL('../src/experience.css', import.meta.url), 'utf8');
const strong = declarations(experience.match(/html\[data-theme\] :where\(body:has[^\{]+\{([^}]+)/)![1]);
const gold = declarations(experience.match(/html\[data-theme="dark"\] \.pv-feature-card \{([^}]+)/)![1]);
const resolve = (tokens: Record<string, string>, name: string): string =>
  tokens[name].replace(/var\((--[\w-]+)\)/g, (_, dependency) => resolve(tokens, dependency));
type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)) as RGB;
const luminance = (value: RGB) => value.map(channel => {
  const normalized = channel / 255;
  return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
}).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
const contrast = (foreground: RGB, background: RGB) => {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};
const samples = (gradient: string): RGB[] => {
  const stops = [...gradient.matchAll(/#[\da-f]{6}\b/gi)].map(match => rgb(match[0]));
  assert.ok(stops.length > 1, 'Gradient has measurable solid color stops');
  return stops.slice(1).flatMap((end, index) => Array.from({ length: 101 }, (_, step) =>
    stops[index].map((start, channel) => start + (end[channel] - start) * step / 100) as RGB));
};

for (const [appearance, tokens] of Object.entries({ light, dark })) {
  test(`${appearance}: body copy, supporting text, links and input boundaries retain contrast`, () => {
    for (const surface of ['--pv-canvas', '--pv-panel', '--pv-field', '--pv-secondary']) {
      for (const ink of ['--pv-text', '--pv-muted', '--pv-link']) {
        assert.ok(contrast(rgb(resolve(tokens, ink)), rgb(resolve(tokens, surface))) >= 4.5, `${ink} on ${surface}`);
      }
    }
    assert.ok(contrast(rgb(resolve(tokens, '--pv-field-edge')), rgb(resolve(tokens, '--pv-field'))) >= 3, 'Field outline');
  });

  test(`${appearance}: gradient text and action labels stay readable throughout their gradients`, () => {
    for (const name of ['--pv-action-gradient', '--pv-action-hover-gradient']) {
      for (const paint of samples(resolve(tokens, name))) assert.ok(contrast(rgb(resolve(tokens, '--pv-on-action')), paint) >= 4.5, name);
    }
    for (const paint of samples(resolve(tokens, '--pv-heading-default-gradient'))) {
      for (const surface of ['--pv-panel', '--pv-canvas', '--pv-secondary']) {
        assert.ok(contrast(paint, rgb(resolve(tokens, surface))) >= 4.5, `Heading on ${surface}`);
      }
    }
    for (const paint of samples(resolve(tokens, '--pv-accent-gradient'))) {
      assert.ok(contrast(rgb(resolve(tokens, '--pv-brand-navy')), paint) >= 4.5, 'Navy label on golden action');
    }
    for (const ink of samples(resolve(tokens, '--pv-heading-inverse-gradient'))) {
      for (const surface of samples(resolve(tokens, '--pv-hero-gradient'))) {
        assert.ok(contrast(ink, surface) >= 4.5, 'Inverse heading across hero gradient');
      }
    }
  });
}

for (const [context, tokens] of Object.entries({
  'navy marketing and navigation': { ...light, ...strong },
  'gold feature panel': { ...dark, ...strong, ...gold },
})) {
  test(`${context}: text, fields and actions keep contrast when surface roles change`, () => {
    for (const surface of ['--pv-panel', '--pv-field', '--pv-secondary']) {
      for (const ink of ['--pv-text', '--pv-muted', '--pv-link']) {
        assert.ok(contrast(rgb(resolve(tokens, ink)), rgb(resolve(tokens, surface))) >= 4.5, `${ink} on ${surface}`);
      }
    }
    assert.ok(contrast(rgb(resolve(tokens, '--pv-field-edge')), rgb(resolve(tokens, '--pv-field'))) >= 3, 'Field boundary');
    for (const paint of samples(resolve(tokens, '--pv-action-gradient'))) {
      assert.ok(contrast(rgb(resolve(tokens, '--pv-on-action')), paint) >= 4.5, 'Contextual action label');
    }
  });
}
