import { useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** How far to shrink on press. Smaller cards want a subtler dip. */
  scaleTo?: number;
};

/**
 * Pressable that springs down on touch. Replaces the opacity flicker of a bare
 * Pressable with something that reads as physical.
 */
export function Tappable({
  children,
  style,
  scaleTo = 0.96,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: 110,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        animate(scaleTo);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animate(1);
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
