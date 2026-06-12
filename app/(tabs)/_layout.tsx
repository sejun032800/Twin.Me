import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon } from '../../src/components/ui/TabIcon';
import { Colors, TabBar } from '../../src/styles/theme';

const TABS = ['/', '/chat', '/history', '/settings'] as const;
const SWIPE_MIN_DIST = 55;
const SWIPE_MIN_VEL = 420;

function pathnameToIndex(pathname: string): number {
  if (pathname.endsWith('/chat')) return 1;
  if (pathname.endsWith('/history')) return 2;
  if (pathname.endsWith('/settings')) return 3;
  return 0;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const idxRef = useRef(0);

  useEffect(() => {
    idxRef.current = pathnameToIndex(pathname);
  }, [pathname]);

  const goTo = (dir: number) => {
    const next = idxRef.current + dir;
    if (next >= 0 && next < TABS.length) {
      router.navigate(TABS[next] as string);
    }
  };

  const swipe = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-20, 20])
    .onEnd((e) => {
      const left = e.translationX < -SWIPE_MIN_DIST || e.velocityX < -SWIPE_MIN_VEL;
      const right = e.translationX > SWIPE_MIN_DIST || e.velocityX > SWIPE_MIN_VEL;
      if (left) runOnJS(goTo)(1);
      else if (right) runOnJS(goTo)(-1);
    });

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.root}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: [
                styles.tabBar,
                { paddingBottom: insets.bottom + 8, height: TabBar.height + insets.bottom },
              ],
              tabBarBackground: () => <View style={styles.tabBarBg} />,
              tabBarActiveTintColor: Colors.GRADIENT_END,
              tabBarInactiveTintColor: Colors.TEXT_MUTED,
              tabBarShowLabel: true,
              tabBarLabelStyle: styles.tabLabel,
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: '홈',
                tabBarIcon: ({ color, focused }) => (
                  <TabIcon name="home" color={color} focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="chat"
              options={{
                title: '채팅',
                tabBarIcon: ({ color, focused }) => (
                  <TabIcon name="chat" color={color} focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="history"
              options={{
                title: '추억',
                tabBarIcon: ({ color, focused }) => (
                  <TabIcon name="history" color={color} focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="settings"
              options={{
                title: '설정',
                tabBarIcon: ({ color, focused }) => (
                  <TabIcon name="settings" color={color} focused={focused} />
                ),
              }}
            />
          </Tabs>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
  },
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
  },
  tabBarBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.DIVIDER_DARK,
    ...(Platform.OS === 'ios' ? { opacity: 0.95 } : {}),
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: -2,
  },
});
