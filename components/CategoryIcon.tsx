import { Image, Text, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  Anchor, Apple, Atom, Award, BadgeCheck, Bell, Bike, Binoculars, Bird, Book, BookMarked, BookOpen, Brain, Brush, Bug,
  Cake, Calculator, Camera, Castle, Cat, Check, CircleCheck, ClipboardCheck, Clock, Cloud, CloudSun, Coffee, Coins,
  Compass, Cookie, Crown, Diamond, Dice5, Dna, Dog, Drum, Dumbbell, Earth, Eye, Feather, Fish, Flag, Flame,
  FlaskConical, Flower2, Footprints, Gamepad2, Gem, Ghost, Gift, Glasses, Globe, GraduationCap, Guitar, Hammer, Hand,
  Handshake, Headphones, Heart, HeartHandshake, Highlighter, Hourglass, Key, Languages, Laugh, Leaf, Library, Lightbulb,
  ListChecks, Lock, Magnet, Map as MapIcon, MapPin, Medal, Megaphone, MessageCircle, Mic, Microscope, Moon, MoonStar,
  Mountain, Music, NotebookPen, Orbit, Origami, Palette, PartyPopper, PawPrint, Pencil, PenTool, Piano, PiggyBank,
  Pizza, Plane, Puzzle, Rabbit, Rainbow, Recycle, Ribbon, Rocket, Ruler, Satellite, School, Scissors, Shield,
  ShieldCheck, Ship, Smile, Snail, Snowflake, Sparkle, Sparkles, Sprout, Squirrel, Stamp, Star, Sun, Sunrise, Swords,
  Target, Telescope, Tent, Theater, ThumbsUp, Ticket, Timer, Trees, Trophy, Turtle, Umbrella, UserCheck, Users,
  Volume2, Wrench, Zap,
} from 'lucide-react-native';

/**
 * Icône d'une catégorie de tampon : même contrat que le composant web (gestion-classe-web/src/components/rewards).
 *   - `icon_ref` = « lucide:<Nom> »  → icône Lucide (noms identiques à la bibliothèque du web, lib/rewardIcons.ts) ;
 *   - `icon_ref` = URL https         → image importée par l'enseignant ;
 *   - sinon                           → l'emoji `icon` (repli, toujours renseigné en base).
 * Un nom Lucide absent de cette liste retombe sur l'emoji : l'app ne peut jamais afficher un texte brut « lucide:… ».
 */

const LUCIDE: Record<string, LucideIcon> = {
  Anchor, Apple, Atom, Award, BadgeCheck, Bell, Bike, Binoculars, Bird, Book, BookMarked, BookOpen, Brain, Brush, Bug,
  Cake, Calculator, Camera, Castle, Cat, Check, CircleCheck, ClipboardCheck, Clock, Cloud, CloudSun, Coffee, Coins,
  Compass, Cookie, Crown, Diamond, Dice5, Dna, Dog, Drum, Dumbbell, Earth, Eye, Feather, Fish, Flag, Flame,
  FlaskConical, Flower2, Footprints, Gamepad2, Gem, Ghost, Gift, Glasses, Globe, GraduationCap, Guitar, Hammer, Hand,
  Handshake, Headphones, Heart, HeartHandshake, Highlighter, Hourglass, Key, Languages, Laugh, Leaf, Library, Lightbulb,
  ListChecks, Lock, Magnet, Map: MapIcon, MapPin, Medal, Megaphone, MessageCircle, Mic, Microscope, Moon, MoonStar,
  Mountain, Music, NotebookPen, Orbit, Origami, Palette, PartyPopper, PawPrint, Pencil, PenTool, Piano, PiggyBank,
  Pizza, Plane, Puzzle, Rabbit, Rainbow, Recycle, Ribbon, Rocket, Ruler, Satellite, School, Scissors, Shield,
  ShieldCheck, Ship, Smile, Snail, Snowflake, Sparkle, Sparkles, Sprout, Squirrel, Stamp, Star, Sun, Sunrise, Swords,
  Target, Telescope, Tent, Theater, ThumbsUp, Ticket, Timer, Trees, Trophy, Turtle, Umbrella, UserCheck, Users,
  Volume2, Wrench, Zap,
};

const LUCIDE_PREFIX = 'lucide:';

export function CategoryIcon({
  icon, iconRef, size = 20, color, style,
}: {
  icon: string | null | undefined;
  iconRef?: string | null;
  size?: number;
  /** Couleur du trait pour une icône Lucide. */
  color?: string;
  style?: StyleProp<ViewStyle & TextStyle>;
}) {
  const ref = (iconRef ?? '').trim();
  if (ref.startsWith(LUCIDE_PREFIX)) {
    const Icon = LUCIDE[ref.slice(LUCIDE_PREFIX.length).trim()];
    if (Icon) return <Icon size={size} color={color ?? '#111'} strokeWidth={2.2} style={style as StyleProp<ViewStyle>} />;
  } else if (/^https:\/\/\S+$/i.test(ref)) {
    return <Image source={{ uri: ref }} style={[{ width: size, height: size }, style as StyleProp<ImageStyle>]} resizeMode="contain" accessibilityIgnoresInvertColors />;
  }
  return <Text style={[{ fontSize: size * 0.9, lineHeight: size * 1.15 }, style as StyleProp<TextStyle>]}>{icon || '⭐'}</Text>;
}
