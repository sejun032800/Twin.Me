import { Stack } from 'expo-router';
import { Colors } from '../../../src/styles/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.BG_DARK_MIDNIGHT },
        animation: 'slide_from_right',
      }}
    />
  );
}
