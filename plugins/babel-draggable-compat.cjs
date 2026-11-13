// DraggableFlatList 4.0.3 calls an API removed in RN 0.88 when keys change.
// Limit the compatibility fix to that file in native bundles. Keep reset
// deferred outside render without replacing the list or changing its gestures.
module.exports = function ({ types: t }) {
  return {
    name: 'draggable-flatlist-rn-088',
    visitor: {
      Program(program, state) {
        const filename = (state.filename || '').replace(/\\/g, '/');
        if (!filename.endsWith('/react-native-draggable-flatlist/src/components/DraggableFlatList.tsx')) return;
        let replaced = 0;
        program.traverse({
          ImportSpecifier(path) {
            if (path.parent.source.value === 'react-native'
              && t.isIdentifier(path.node.imported, { name: 'InteractionManager' })) path.remove();
          },
          CallExpression(path) {
            const callee = path.node.callee;
            if (!t.isMemberExpression(callee)
              || !t.isIdentifier(callee.object, { name: 'InteractionManager' })
              || !t.isIdentifier(callee.property, { name: 'runAfterInteractions' })) return;
            path.replaceWith(t.callExpression(t.identifier('requestAnimationFrame'), path.node.arguments));
            replaced++;
          },
        });
        // A future upstream fix must retire this compatibility transform.
        if (replaced !== 1) throw program.buildCodeFrameError('Review DraggableFlatList compatibility fix: expected one removed InteractionManager call');
      },
    },
  };
};
