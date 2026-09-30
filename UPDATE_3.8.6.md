# Kudos 3.8.6

## 14-point zero-floor fix
The root cause was in `normalizeFamilyState()`: cloud-loaded `balanceResetEvents`
were being omitted when the state was normalized. The app therefore loaded the
correct reset-to-zero event from Supabase and then silently discarded it.

`balanceResetEvents` are now preserved and validated during normalization. This
allows the two affected profiles to honor their existing reset history and use
0 as the actual balance floor.

## Profile currency edit crash
The Dollar Bill icon previously used a conditional React Native `transform`
whose non-dollar value was `undefined`. Switching currency types could cause the
native style processor to attempt `.forEach()` on a null transform.

The Dollar icon now has its own render branch and no nullable transform value.

## Additional null safety
Nullable cloud schedule arrays are normalized to empty arrays before reaching
components, preventing similar array-method crashes from stale/legacy data.
