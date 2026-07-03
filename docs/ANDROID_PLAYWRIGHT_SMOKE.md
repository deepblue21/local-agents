# Android Playwright Smoke

Playwright Android support is experimental. In this project it is used only for a small
native-device smoke check: install the APK, open the `localagents://pair` deep link, verify
that the host confirmation panel appears, and save a screenshot artifact.

This is not a replacement for Compose UI tests. Compose semantics, navigation, widgets, and
stateful UI behavior should stay in Android unit/instrumented tests. The Playwright smoke
test is deliberately opt-in because it needs a live ADB device or emulator and is more
environment-sensitive than the normal CI suite.

Set `LOCAL_AGENTS_ANDROID_SMOKE=1` to opt in.

## Requirements

- Android SDK platform tools with `adb` available.
- One authenticated Android device or AVD emulator visible in `adb devices`.
- Device screen awake and unlocked.
- Debug APK built at `android/app/build/outputs/apk/debug/Local_Agents-debug.apk`, or
  `LOCAL_AGENTS_APK` pointing to another APK.
- Node.js in the shell running the smoke test.

## Run

```powershell
cd e2e\android-smoke
npm install
$env:LOCAL_AGENTS_ANDROID_SMOKE='1'
npm run android:smoke
```

With more than one ADB device:

```powershell
$env:LOCAL_AGENTS_ANDROID_SERIAL='emulator-5554'
npm run android:smoke
```

With a non-default APK path:

```powershell
$env:LOCAL_AGENTS_APK='C:\Users\salih\Local_Agents\android\app\build\outputs\apk\release\Local_Agents-release.apk'
npm run android:smoke
```

## CI Policy

Do not run this smoke test in the default GitHub Actions CI yet. It depends on emulator
boot timing, ADB authentication, screen state, and Playwright's experimental Android layer.
The stable CI signal remains:

- Python lint/tests.
- Android `testDebugUnitTest`.
- Android instrumented/Compose tests when a managed emulator job is explicitly added.
