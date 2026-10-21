import { motion, useReducedMotion } from 'motion/react';

/** One shared highlight moves between the controls in its navigation group. */
export default function NavigationHighlight({ id }: { id: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.span aria-hidden="true" className="user-navigation-highlight" layoutId={id}
    initial={false} transition={{ duration: reduceMotion ? 0 : .2, ease: [.22, 1, .36, 1] }} />;
}
