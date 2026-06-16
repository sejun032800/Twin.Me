import React from 'react';
import { Text, TextProps } from 'react-native';
import { Typography } from '../../styles/theme';

type TypographyVariant = keyof typeof Typography;

interface StyledTextProps extends TextProps {
  variant?: TypographyVariant;
}

/**
 * 스포카 한 산스 네오 기반 텍스트 컴포넌트.
 * variant prop으로 Typography 프리셋을 선택하고, style로 추가 재정의한다.
 * variant 미지정 시 bodyMd(Regular 15pt)를 기본값으로 사용.
 */
export function StyledText({ variant = 'bodyMd', style, ...props }: StyledTextProps) {
  return <Text {...props} style={[Typography[variant], style]} />;
}
