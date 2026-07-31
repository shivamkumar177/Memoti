import { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  /** Stagger index — each step adds 35ms so lists cascade instead of popping. */
  index?: number;
  style?: ViewStyle;
};

const STAGGER_MS = 35;
const MAX_STAGGER_MS = 280;

/**
 * Fades and lifts content in on mount. Uses the native driver, so it costs
 * nothing on the JS thread during scrolling.
 */
export function FadeIn({ children, index = 0, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: Math.min(index * STAGGER_MS, MAX_STAGGER_MS),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
