import { LinearGradient, LinearGradientProps } from 'expo-linear-gradient';
import React from 'react';
import { ColorValue } from 'react-native';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Gradients } from '../../styles/theme';

type GradientPreset = keyof typeof Gradients;

interface TwinGradientProps
  extends Omit<LinearGradientProps, 'colors' | 'start' | 'end'> {
  preset?: GradientPreset;
  colors?: readonly string[];
  start?: LinearGradientProps['start'];
  end?: LinearGradientProps['end'];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function TwinGradient({
  preset = 'TWIN_PRIMARY',
  colors,
  start,
  end,
  style,
  children,
  ...rest
}: TwinGradientProps) {
  const config = Gradients[preset];

  return (
    <LinearGradient
      colors={(colors ?? config.colors) as [ColorValue, ColorValue, ...ColorValue[]]}
      start={start ?? config.start}
      end={end ?? config.end}
      style={[styles.base, style]}
      {...rest}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
});
