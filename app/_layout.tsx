import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { Colors } from '../src/styles/theme';
import { AppProvider } from '../src/context/AppContext';
import { CustomThemeProvider } from '../src/context/CustomThemeContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AppProvider>
        <CustomThemeProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </CustomThemeProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
  },
});
