# BrightSteps 2.9.4

- Permanent business-rule errors no longer block the upload queue.
- Invalid changes are moved to a persistent Failed Sync Changes list while later changes continue syncing.
- Added Settings > Failed Sync Changes with Retry, Retry All, and Discard controls.
- Insufficient-balance redemptions are explained in plain language.
- Discarding a failed optimistic change reloads authoritative cloud data.
- The cloud banner Retry action now retries the mutation queue instead of only downloading data.
- Edge Function error bodies are parsed so users see the actual reason rather than a generic non-2xx message.
