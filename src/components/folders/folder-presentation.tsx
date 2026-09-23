import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Target,
  type LucideIcon,
} from "lucide-react";

const folderIcons: Record<string, LucideIcon> = {
  book: BookOpen,
  target: Target,
  calendar: CalendarDays,
  graduation: GraduationCap,
};

const folderColorClasses: Record<string, { badge: string; border: string; icon: string }> = {
  orange: {
    badge: "bg-[#FEF3C7] text-[#92400E]",
    border: "border-[#E06B43]",
    icon: "text-[#E06B43]",
  },
  blue: {
    badge: "bg-[#E0F2FE] text-[#0369A1]",
    border: "border-[#0284C7]",
    icon: "text-[#0284C7]",
  },
  green: {
    badge: "bg-[#DCFCE7] text-[#166534]",
    border: "border-[#16A34A]",
    icon: "text-[#16A34A]",
  },
  purple: {
    badge: "bg-[#F3E8FF] text-[#7E22CE]",
    border: "border-[#A855F7]",
    icon: "text-[#9333EA]",
  },
};

export const folderAppearanceOptions = [
  { value: "book", label: "Sách" },
  { value: "target", label: "Mục tiêu" },
  { value: "calendar", label: "Lịch học" },
  { value: "graduation", label: "Tốt nghiệp" },
] as const;

export const folderColorOptions = [
  { value: "orange", label: "Cam" },
  { value: "blue", label: "Xanh dương" },
  { value: "green", label: "Xanh lá" },
  { value: "purple", label: "Tím" },
] as const;

export function FolderIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = folderIcons[icon] ?? BookOpen;
  return <Icon className={className} aria-hidden="true" />;
}

export function getFolderColorClasses(color: string) {
  return folderColorClasses[color] ?? folderColorClasses.orange;
}
