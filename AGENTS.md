# Local_Agents Engineering Notes

- The Android app is a controller. Provider credentials remain on the PC companion.
- A phone disconnect must never cancel a run. Run events are persisted and replayable.
- Raw model chain-of-thought is not exposed. Show statuses, tool calls, and final output.
- Host filesystem access is forbidden. Tools only operate on configured runner mounts.
- Public API changes must update `docs/ARCHITECTURE.md` and both server and Android models.
- UI is an operational console: compact, high contrast, and free of decorative hero content.
