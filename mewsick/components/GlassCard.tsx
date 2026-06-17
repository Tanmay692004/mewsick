import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

type GlassCardProps = ViewProps & {
  children: ReactNode;
  blur?: boolean;
  className?: string;
};

export function GlassCard({ children, blur = true, className = '', style, ...rest }: GlassCardProps) {
  return (
    <View
      className={`overflow-hidden rounded-3xl border border-white/10 bg-white/5 ${className}`}
      style={style}
      {...rest}
    >
      {blur ? <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFillObject} /> : null}
      <View className="relative z-10 p-5">{children}</View>
    </View>
  );
}
