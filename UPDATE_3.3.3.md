# BrightSteps 3.3.3

- Fixed cloud sync incorrectly calling `FileSystem.readAsStringAsync()` on signed Supabase media URLs.
- Existing profile/task/reward photos already stored in BrightSteps Cloud are now recognized and their storage paths are reused.
- `readAsStringAsync()` is now reserved for actual local device files/data selected by the user.
- Added local-file existence checking with a readable error if a selected local photo has genuinely been removed from the device.
- Prevents this media-path bug from incorrectly forcing BrightSteps into “Working From The Offline Cache.”
