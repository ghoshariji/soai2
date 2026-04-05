import React from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';

/**
 * Use for short static lists (settings sections, modals). Avoid wrapping every
 * row in a virtualized `FlatList` — recycling can replay enter animations.
 */
interface ListItemEnterProps {
  index: number;
  children: React.ReactNode;
}

/** Staggered list row entrance (cap delay so long lists stay fast). */
const ListItemEnter: React.FC<ListItemEnterProps> = ({ index, children }) => (
  <Animated.View
    entering={FadeInDown.duration(240).delay(Math.min(index, 14) * 36)}
  >
    {children}
  </Animated.View>
);

export default React.memo(ListItemEnter);
