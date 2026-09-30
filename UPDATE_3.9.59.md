# Kudos Family 3.9.59

- Fixed the child-account onboarding race that could display adult workspace creation before the child invite finished linking.
- Child signup now refreshes cloud membership immediately after the code is accepted.
- Anonymous child sessions can load only their linked personal profile; cached parent, teacher, or unrelated workspace access is ignored.
- Child sessions can never reach the family/classroom creation page, even while offline or waiting for membership refresh.
- The database now permanently blocks anonymous child accounts from creating workspaces or becoming parents/teachers.
- The security migration revokes any manager membership accidentally created by an anonymous account while preserving workspace data.

## Production deployment

Apply migration `20260901000100_enforce_child_account_boundaries.sql`. No Edge Function redeployment is required for this change.

Build and distribute the 3.9.59 client after applying the migration. Existing child accounts will select their linked child membership and ignore any invalid manager workspace saved by the old client.
