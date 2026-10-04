# Europe location class

Run this after the feature file exists and before calling the lane truthful.

```bash
cd src-tauri && cargo test --lib batch_a_location_strings -- --test-threads=8
cd src-tauri && cargo test --lib product_lane_keeps_unknown -- --test-threads=8
```

Pass means every example row in `tests/features/europe_location_class.feature` matches `classify`, and the product lane keeps Eindhoven and Kiel while it still removes Wilmington, DE.

The cucumber runner is not wired for this feature. The library tests are the check.
