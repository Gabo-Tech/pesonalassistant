/**
 * Expo config plugin for the assistant's Android needs.
 *
 * Android 11 (API 30) introduced package visibility filtering: an app can no longer
 * see which other apps are installed unless it declares them in a <queries> block.
 * Without this, Linking.canOpenURL('sgnl://...') returns false even when Signal is
 * installed, and our "is WhatsApp available?" checks silently fail.
 */
const { withAndroidManifest } = require('expo/config-plugins');

/** Packages we hand a draft to after the user confirms a send. */
const TARGET_PACKAGES = [
  'com.whatsapp', // WhatsApp
  'com.whatsapp.w4b', // WhatsApp Business
  'org.thoughtcrime.securesms', // Signal
  'com.twitter.android', // X (still the legacy package id)
];

const withAssistantAndroid = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // xml2js represents repeated tags as arrays, so merge instead of overwriting.
    const queries = manifest.queries?.[0] ?? {};

    queries.package = [
      ...(queries.package ?? []),
      ...TARGET_PACKAGES.map((name) => ({ $: { 'android:name': name } })),
    ].filter(
      (entry, index, all) =>
        all.findIndex((other) => other.$['android:name'] === entry.$['android:name']) === index,
    );

    // Lets us resolve https:// and custom-scheme targets (wa.me, sgnl://, x.com).
    queries.intent = [
      ...(queries.intent ?? []),
      {
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': 'https' } }],
      },
      {
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      },
    ];

    manifest.queries = [queries];
    return cfg;
  });

module.exports = withAssistantAndroid;
