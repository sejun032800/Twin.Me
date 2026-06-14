import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../src/styles/theme';
import { AppProvider } from '../src/context/AppContext';
import { CustomThemeProvider } from '../src/context/CustomThemeContext';

// Keep splash visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = Font.useFonts({
    'SpoqaHanSansNeo-Regular': require('../assets/fonts/SpoqaHanSansNeo-Regular.otf'),
    'SpoqaHanSansNeo-Medium':  require('../assets/fonts/SpoqaHanSansNeo-Medium.otf'),
    'SpoqaHanSansNeo-Bold':    require('../assets/fonts/SpoqaHanSansNeo-Bold.otf'),
    'SpoqaHanSansNeo-Light':   require('../assets/fonts/SpoqaHanSansNeo-Light.otf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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
