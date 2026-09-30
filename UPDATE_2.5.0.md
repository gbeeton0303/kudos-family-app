# BrightSteps 2.5.0

- Ten new preset child avatars: five boys and five girls matching the requested skin, hair, and eye combinations.
- Parent profile pages now include an Edit Profile button.
- Profile edits sync to Supabase, including uploaded profile photos.
- Push notifications cover task submissions, task reviews, reward delivery, and reward opening/redemption.

## Important deployment step
Redeploy the updated Edge Functions after updating:

```bash
npm run supabase:functions:deploy
```

Push notifications require an EAS development or production build on physical devices.
