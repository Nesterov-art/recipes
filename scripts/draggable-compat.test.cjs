const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const fs = require('node:fs');
const babel = require('@babel/core');
const generate = require('@babel/generator').default;

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'node_modules/react-native-draggable-flatlist/src/components/DraggableFlatList.tsx');

// Execute the actual dependency's data-change branch with the project's Babel
// plugins. RN 0.88 release exports no InteractionManager. Only hooks and the
// frame scheduler are supplied here, not a replacement list implementation.
function renderDataChange(platform, before, after) {
  const config = babel.loadPartialConfig({ cwd: root, filename, caller: { name: 'metro', platform } });
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, configFile: false, babelrc: false,
    plugins: config.options.plugins,
    parserOpts: { plugins: ['typescript', 'jsx'] }, ast: true, code: false,
  });
  const component = result.ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'DraggableFlatListInner');
  const body = component.body.body;
  const start = body.findIndex(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'dataRef');
  const end = body.findIndex((node, index) => index > start && node.type === 'IfStatement');
  assert.ok(start >= 0 && end > start, 'Installed list must expose its data-change branch');
  const code = body.slice(start, end + 1).map(node => generate(node).code).join('\n');
  const queued = [];
  let resets = 0;
  const context = {
    props: { data: after }, useRef: () => ({ current: before }),
    keyExtractor: item => item.id, activeKey: 'a',
    InteractionManager: undefined,
    reset: () => { resets++; },
    requestAnimationFrame: callback => queued.push(callback),
  };
  assert.doesNotThrow(() => vm.runInNewContext(code, context));
  assert.equal(resets, 0, 'Reset must stay outside render');
  for (const callback of queued) callback();
  return { resets, scheduled: queued.length, activeKey: context.activeKey };
}

for (const platform of ['android', 'ios']) {
  for (const [operation, before, after] of [
    ['add', [{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]],
    ['delete', [{ id: 'a' }, { id: 'b' }], [{ id: 'b' }]],
    ['reorder', [{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }]],
  ]) {
    test(`${platform}: ${operation} schedules one reset without removed RN APIs`, () => {
      assert.deepEqual(renderDataChange(platform, before, after), { resets: 1, scheduled: 1, activeKey: null });
    });
  }
  test(`${platform}: editing an amount with unchanged keys does not reset drag state`, () => {
    assert.deepEqual(renderDataChange(platform, [{ id: 'a', quantity: 1 }], [{ id: 'a', quantity: 2 }]),
      { resets: 0, scheduled: 0, activeKey: 'a' });
  });
}
