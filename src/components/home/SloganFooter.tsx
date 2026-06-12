import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontSize, FontWeight, Spacing, ThemeTokens } from '../../styles/theme';

interface Props {
  t: ThemeTokens;
}

export default function SloganFooter({ t }: Props) {
  return (
    <View style={styles.container}>
      <Text style={[styles.divider, { color: t.divider }]}>· · ·</Text>
      <Text style={[styles.slogan, { color: t.textMuted }]}>
        "내가 없는 순간에도,{'\n'}너를 가장 나답게 사랑할 또 하나의 나."
      </Text>
      <Text style={[styles.brand, { color: t.textMuted }]}>— twin.me</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  divider: {
    fontSize: FontSize.base,
    letterSpacing: 6,
    marginBottom: Spacing.xs,
    opacity: 0.4,
  },
  slogan: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.9,
    fontStyle: 'italic',
    opacity: 0.65,
  },
  brand: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    opacity: 0.45,
    letterSpacing: 1.5,
    marginTop: 4,
  },
});
