import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useTransform, motion } from 'framer-motion';

export function AnimatedNumber({ value, prefix = '' }: { value: number; prefix?: string }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 90, damping: 20, mass: 0.6 });
  const display = useTransform(spring, (v) => `${prefix}${Math.round(v).toLocaleString()}`);
  const mounted = useRef(false);

  useEffect(() => {
    motionVal.set(value);
    mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <motion.span>{display}</motion.span>;
}
