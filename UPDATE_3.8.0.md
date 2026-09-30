# Kudos 3.8.0 — reward cloud-send repair

This build repairs an individual reward that exists locally but has a missing/stale cloud template or child assignment.

Before sending/redeeming a reward, the app now self-heals that reward by upserting its cloud reward template and the selected child's reward assignment, then runs the existing atomic redemption/delivery action.

This specifically addresses the pattern where **Choose family movie** fails with “Cloud request failed” while other rewards send normally.
