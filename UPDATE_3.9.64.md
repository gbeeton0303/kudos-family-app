# Kudos Family 3.9.64

- Replaced the incorrect StoreKit trial product with a server-managed seven-day family/classroom trial.
- Trial start and expiration now use trusted Supabase timestamps and cannot be restarted by repeated taps.
- Only the family or classroom creator can start the trial; invited adults and children inherit its access.
- StoreKit product loading, purchase verification, and restoration now apply only to the $5.99 lifetime non-consumable.
- Added a forward-only database migration and regression coverage for the server-managed trial.
