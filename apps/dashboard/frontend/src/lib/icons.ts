import {
  Activity,
  BookOpen,
  Box,
  Container,
  Github,
  GraduationCap,
  Home,
  Music2,
  Network,
  Play,
  Shield,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  container: Container,
  github: Github,
  play: Play,
  home: Home,
  wallet: Wallet,
  music: Music2,
  book: BookOpen,
  graduation: GraduationCap,
  shield: Shield,
  network: Network,
  box: Box,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] || Box;
}
