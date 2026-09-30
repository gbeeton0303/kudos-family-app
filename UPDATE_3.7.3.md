# BrightSteps 3.7.3

- Treasure chest currency stage lowered to the actual bottom interior edge.
- Piggy-bank fill background is now the belly fill stage itself (light pink), eliminating the separate pink block around the eye.
- Piggy-bank fill area is slightly wider/rightward so the belly fills more naturally.
- Added a Dollar Bill earning currency with a custom green bill PNG icon and storage-pile rendering.
- Updated persisted currency validation to accept dollars.
- Stabilized the main app ScrollView around task-completion overlays by no longer toggling native scrollEnabled when the celebration opens/closes, and disabled automatic content-inset adjustment to prevent iOS offset re-clamping/bounce.
