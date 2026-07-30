// @ts-nocheck
/**
 * electron-builder `afterSign` hook — notarize the signed macOS .app via
 * Apple's `notarytool`.
 *
 * Credentials come from the environment ONLY (never committed):
 *   - APPLE_ID                     Apple Developer account email
 *   - APPLE_APP_SPECIFIC_PASSWORD  app-specific password for that account
 *   - APPLE_TEAM_ID                Developer Team ID (10-char)
 *
 * If any are missing (local dev, or a non-release build) notarization is
 * SKIPPED with a warning rather than failing the build — a release build in CI
 * is expected to have all three set (see 60-devops-infrastructure §7.2).
 *
 * CI TODO: the infra doc's canonical path uses an App Store Connect API key
 * (APPLE_API_KEY / _ID / _ISSUER) instead of an app-specific password. To
 * switch, swap the notarize() options to `{ tool: 'notarytool', appPath,
 * appleApiKey, appleApiKeyId, appleApiIssuer }`.
 *
 * This is a CommonJS build script (not part of the app bundle or tsconfig), so
 * it is intentionally excluded from the strict TypeScript typecheck.
 */
const { notarize } = require('@electron/notarize');

exports.default = async function notarizeMac(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      '[cue] Skipping macOS notarization — set APPLE_ID, ' +
        'APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID to enable it ' +
        '(required for release builds).',
    );
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[cue] Notarizing ${appPath} via notarytool…`);
  await notarize({
    tool: 'notarytool',
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log('[cue] Notarization complete.');
};
