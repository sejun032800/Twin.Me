import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Text, TextInput } from 'react-native';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../src/styles/theme';
import { AppProvider } from '../src/context/AppContext';
import { CustomThemeProvider } from '../src/context/CustomThemeContext';
import { bootstrapNotifications } from '../src/services/localNotificationService';
import AuraMeshBackground from '../src/components/aura/AuraMeshBackground';

// Keep splash visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

// ── 전역 기본 폰트 주입 ───────────────────────────────────────────────────────
// 앱 내 모든 <Text>/<TextInput>이 별도 fontFamily 지정 없이도
// 스포카 한 산스 네오 Regular를 자동 상속한다.
// (폰트 로드 완료 이후 렌더링되므로 안전)
const SPOQA_REGULAR = 'SpoqaHanSansNeo-Regular';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Text as any).defaultProps = { ...(Text as any).defaultProps, style: { fontFamily: SPOQA_REGULAR } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, style: { fontFamily: SPOQA_REGULAR } };

export default function RootLayout() {
  const [fontsLoaded, fontError] = Font.useFonts({
    'SpoqaHanSansNeo-Regular': require('../assets/fonts/SpoqaHanSansNeo-Regular.otf'),
    'SpoqaHanSansNeo-Medium':  require('../assets/fonts/SpoqaHanSansNeo-Medium.otf'),
    'SpoqaHanSansNeo-Bold':    require('../assets/fonts/SpoqaHanSansNeo-Bold.otf'),
    'SpoqaHanSansNeo-Light':   require('../assets/fonts/SpoqaHanSansNeo-Light.otf'),
  });

  useEffect(() => {
    bootstrapNotifications();
  }, []);

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
          <AuraMeshBackground />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="highlight-gallery" />
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
