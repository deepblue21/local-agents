import { expect, test, type TestInfo } from '@playwright/test';
import { _android as android, type AndroidDevice } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const APP_PACKAGE = 'com.localagents.app';
const DEEP_LINK =
  'localagents://pair?url=https%3A%2F%2Fagents.example.test&code=ABCD1234EFGH';
const DEFAULT_APK = path.resolve(
  '../../android/app/build/outputs/apk/debug/Local_Agents-debug.apk',
);

test.describe('Local_Agents Android smoke', () => {
  test.skip(
    process.env.LOCAL_AGENTS_ANDROID_SMOKE !== '1',
    'Set LOCAL_AGENTS_ANDROID_SMOKE=1 and connect an authenticated ADB device/emulator.',
  );

  test('installs the APK and opens pair deep-link confirmation', async ({}, testInfo) => {
    const apkPath = path.resolve(process.env.LOCAL_AGENTS_APK ?? DEFAULT_APK);
    await assertFileExists(apkPath);

    const device = await firstDevice();
    try {
      await device.installApk(apkPath);
      await device.shell(`pm clear ${APP_PACKAGE}`);
      await device.shell(
        `sh -c 'pm grant ${APP_PACKAGE} android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true'`,
      );

      await device.shell(
        `am start -W -a android.intent.action.VIEW -d "${DEEP_LINK}" ${APP_PACKAGE}`,
      );

      await device.wait({ text: 'BAĞLANTI ONAYI' }, { timeout: 20_000 });
      await device.wait({ text: 'https://agents.example.test' }, { timeout: 20_000 });

      const screenshot = testInfo.outputPath('pair-link-confirmation.png');
      await device.screenshot({ path: screenshot });

      const screenshotInfo = await fs.stat(screenshot);
      expect(screenshotInfo.size).toBeGreaterThan(0);
    } finally {
      await device.close();
    }
  });
});

async function firstDevice(): Promise<AndroidDevice> {
  const devices = await android.devices();
  test.skip(devices.length === 0, 'No authenticated Android device/emulator found over ADB.');

  const serial = process.env.LOCAL_AGENTS_ANDROID_SERIAL;
  if (serial) {
    const selected = devices.find((device) => device.serial() === serial);
    if (!selected) {
      throw new Error(`LOCAL_AGENTS_ANDROID_SERIAL=${serial} is not connected.`);
    }
    return selected;
  }

  test.skip(
    devices.length > 1,
    'Multiple Android devices connected; set LOCAL_AGENTS_ANDROID_SERIAL.',
  );
  return devices[0];
}

async function assertFileExists(file: string): Promise<void> {
  try {
    await fs.access(file);
  } catch {
    throw new Error(
      `APK not found: ${file}. Build it with android/gradlew assembleDebug or set LOCAL_AGENTS_APK.`,
    );
  }
}
