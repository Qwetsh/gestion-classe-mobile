import React from 'react';
import {
  Ban,
  ClipboardList,
  Cross,
  DoorOpen,
  Hand,
  LogOut,
  MessageCircle,
  XCircle,
} from 'lucide-react-native';

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  hand: Hand,
  'message-circle': MessageCircle,
  'log-out': LogOut,
  'x-circle': XCircle,
  cross: Cross,
  'door-open': DoorOpen,
  'clipboard-list': ClipboardList,
  ban: Ban,
};

interface RadialIconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function RadialIcon({ name, size = 20, color = '#FFFFFF', strokeWidth = 2 }: RadialIconProps) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
