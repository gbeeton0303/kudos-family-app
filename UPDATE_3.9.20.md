# Kudos 3.9.20

- Fixed profile crash: `ReferenceError: Property 'onGoalPress' doesn't exist`.
- Rebuilt the CurrencyStorage prop type and function signature so `onGoalPress` is always defined in component scope.
- `onGoalPress` now explicitly defaults to `undefined`.
- `visualOnly` remains explicitly defined and defaults to `false`.
- Reward-goal picker behavior on profiles with multiple rewards remains unchanged.
- Task-complete visual-only storage behavior remains unchanged.
