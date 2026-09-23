import * as SecureStore from 'expo-secure-store';

const KEY = 'assistant.cloud.apiKey';

export async function readCloudKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveCloudKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) return;
  await SecureStore.setItemAsync(KEY, trimmed);
}

export async function clearCloudKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Already gone.
  }
}
