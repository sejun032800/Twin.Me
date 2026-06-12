import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ColorValue, StyleSheet, View } from 'react-native';
import { Gradients } from '../../styles/theme';

type IconName = 'home' | 'chat' | 'history' | 'settings';

interface TabIconProps {
  name: IconName;
  color: ColorValue;
  focused: boolean;
}

const ACTIVE_COLOR = '#FFFFFF';

const ICONS: Record<IconName, (color: ColorValue) => React.ReactNode> = {
  home: (color) => (
    <View style={styles.iconContainer}>
      <View style={[styles.roof, { borderBottomColor: color }]} />
      <View style={[styles.house, { borderColor: color }]} />
    </View>
  ),
  chat: (color) => (
    <View style={[styles.bubble, { borderColor: color }]}>
      <View style={[styles.bubbleTail, { borderTopColor: color }]} />
    </View>
  ),
  history: (color) => (
    <View style={[styles.circle, { borderColor: color }]}>
      <View style={[styles.innerDot, { backgroundColor: color }]} />
    </View>
  ),
  settings: (color) => (
    <View style={[styles.gear, { borderColor: color }]}>
      <View style={[styles.gearInner, { borderColor: color }]} />
    </View>
  ),
};

export function TabIcon({ name, color, focused }: TabIconProps) {
  if (focused) {
    return (
      <View style={styles.wrapper}>
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={Gradients.TWIN_PRIMARY.start}
          end={Gradients.TWIN_PRIMARY.end}
          style={styles.gradientPill}
        >
          {ICONS[name](ACTIVE_COLOR)}
        </LinearGradient>
      </View>
    );
  }
  return (
    <View style={styles.wrapper}>
      {ICONS[name](color)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 48,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientPill: {
    width: 48,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Home
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 22,
    height: 22,
  },
  roof: {
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
  house: {
    width: 14,
    height: 10,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderRadius: 1,
  },

  // Chat
  bubble: {
    width: 20,
    height: 18,
    borderWidth: 1.5,
    borderRadius: 10,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -5,
    left: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 0,
    borderRightWidth: 6,
    borderTopWidth: 5,
    borderRightColor: 'transparent',
  },

  // History
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Settings
  gear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
  },
});
