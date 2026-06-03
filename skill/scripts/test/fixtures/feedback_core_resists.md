---
name: Core rule resists decay
description: a core (0.9) feedback memory at the same age as feedback_flat_stale — must NOT flag
type: feedback
confidence: 0.9
created: 2024-01-01
last_confirmed: 2025-11-01
reaffirm_count: 3
---
Body text. Same last_confirmed as feedback_flat_stale (0.5) but higher stored
confidence, so its decayed effective confidence stays above the flag floor.
