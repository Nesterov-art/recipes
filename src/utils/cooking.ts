// Step-by-step cooking walks the saved directions in their order. Blank lines are
// not steps; the recipe itself is never changed.
export function cookingSteps(steps: readonly string[]) {
  return steps.map(step => step.trim()).filter(Boolean);
}
