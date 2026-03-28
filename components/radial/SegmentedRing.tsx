import React from 'react';
import { Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MENU_ITEMS, MENU_RADIUS, ITEM_SIZE } from '../../constants/menuItems';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedSvg = Animated.createAnimatedComponent(Svg);

interface SegmentedRingProps {
  menuScale: Animated.Value;
  menuOpacity: Animated.Value;
  hoveredIndex: number | null;
  bonusFillProgress: Animated.Value;
}

const INNER_RADIUS = 40;
const OUTER_RADIUS = MENU_RADIUS + ITEM_SIZE / 2 + 8;
const GAP_ANGLE = 0.04; // radians gap between segments
const RING_SIZE = (OUTER_RADIUS + 4) * 2;
const CENTER = RING_SIZE / 2;

// Participation is index 0
const PARTICIPATION_INDEX = 0;

function describeArc(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStartX = cx + outerR * Math.cos(startAngle);
  const outerStartY = cy + outerR * Math.sin(startAngle);
  const outerEndX = cx + outerR * Math.cos(endAngle);
  const outerEndY = cy + outerR * Math.sin(endAngle);
  const innerStartX = cx + innerR * Math.cos(endAngle);
  const innerStartY = cy + innerR * Math.sin(endAngle);
  const innerEndX = cx + innerR * Math.cos(startAngle);
  const innerEndY = cy + innerR * Math.sin(startAngle);

  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${outerStartX} ${outerStartY}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEndX} ${outerEndY}`,
    `L ${innerStartX} ${innerStartY}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEndX} ${innerEndY}`,
    'Z',
  ].join(' ');
}

// Pre-compute fill arc paths at discrete steps for animation
const FILL_STEPS = 60;
const segmentAngle = (2 * Math.PI) / MENU_ITEMS.length;
const partStartAngle = (PARTICIPATION_INDEX - 0.5) * segmentAngle - Math.PI / 2 + GAP_ANGLE / 2;
const partEndAngle = (PARTICIPATION_INDEX + 0.5) * segmentAngle - Math.PI / 2 - GAP_ANGLE / 2;
const partTotalAngle = partEndAngle - partStartAngle;

function getFillPath(progress: number): string {
  if (progress <= 0) return '';
  const fillEnd = partStartAngle + partTotalAngle * Math.min(progress, 1);
  return describeArc(CENTER, CENTER, INNER_RADIUS, OUTER_RADIUS, partStartAngle, fillEnd);
}

export function SegmentedRing({ menuScale, menuOpacity, hoveredIndex, bonusFillProgress }: SegmentedRingProps) {
  const totalItems = MENU_ITEMS.length;
  const segAngle = (2 * Math.PI) / totalItems;

  const segments = MENU_ITEMS.map((item, index) => {
    // Offset by half a segment so each button sits centered in its section
    const startAngle = (index - 0.5) * segAngle - Math.PI / 2 + GAP_ANGLE / 2;
    const endAngle = (index + 0.5) * segAngle - Math.PI / 2 - GAP_ANGLE / 2;
    const isHovered = hoveredIndex === index;
    const path = describeArc(CENTER, CENTER, INNER_RADIUS, OUTER_RADIUS, startAngle, endAngle);

    return (
      <Path
        key={item.id}
        d={path}
        fill={isHovered ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.75)'}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
      />
    );
  });

  // Animated fill arc for participation bonus
  // We use interpolation to map progress (0-1) to discrete fill path steps
  const fillPaths = Array.from({ length: FILL_STEPS + 1 }, (_, i) => i / FILL_STEPS);
  const fillD = bonusFillProgress.interpolate({
    inputRange: fillPaths,
    outputRange: fillPaths.map((p) => getFillPath(p) || 'M0 0'),
  });

  return (
    <AnimatedSvg
      width={RING_SIZE}
      height={RING_SIZE}
      style={{
        position: 'absolute',
        left: -RING_SIZE / 2,
        top: -RING_SIZE / 2,
        opacity: menuOpacity,
        transform: [{ scale: menuScale }],
      }}
    >
      {segments}
      <AnimatedPath
        d={fillD}
        fill="rgba(52, 211, 153, 0.5)"
        stroke="rgba(52, 211, 153, 0.8)"
        strokeWidth={1.5}
      />
    </AnimatedSvg>
  );
}
