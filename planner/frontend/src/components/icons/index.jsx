import React from "react";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const CATEGORY_ICONS = [
  { key: "sun", label: "Утро", Icon: SunIcon },
  { key: "moon", label: "Сон", Icon: MoonIcon },
  { key: "home", label: "Дом", Icon: HomeIcon },
  { key: "book", label: "Чтение", Icon: BookIcon },
  { key: "code", label: "Разработка", Icon: CodeIcon },
  { key: "briefcase", label: "Работа", Icon: BriefcaseIcon },
  { key: "heart", label: "Здоровье", Icon: HeartIcon },
  { key: "dumbbell", label: "Спорт", Icon: DumbbellIcon },
  { key: "calendar", label: "Календарь", Icon: CalendarIcon },
  { key: "clock", label: "Время", Icon: ClockIcon },
  { key: "coffee", label: "Отдых", Icon: CoffeeIcon },
  { key: "cart", label: "Покупки", Icon: CartIcon },
  { key: "utensils", label: "Еда", Icon: UtensilsIcon },
  { key: "sparkle", label: "Порядок", Icon: SparkleIcon },
  { key: "target", label: "Цель", Icon: TargetIcon },
  { key: "users", label: "Встречи", Icon: UsersIcon },
  { key: "car", label: "Поездки", Icon: CarIcon },
  { key: "plane", label: "Путешествие", Icon: PlaneIcon },
  { key: "music", label: "Хобби", Icon: MusicIcon },
  { key: "wallet", label: "Финансы", Icon: WalletIcon },
  { key: "bank", label: "Банк", Icon: BankIcon },
  { key: "file", label: "Документы", Icon: FileIcon },
  { key: "note", label: "Заметки", Icon: NoteIcon },
  { key: "checklist", label: "Задачи", Icon: ChecklistIcon },
  { key: "lightbulb", label: "Идеи", Icon: LightbulbIcon },
  { key: "graduation", label: "Учеба", Icon: GraduationIcon },
  { key: "palette", label: "Творчество", Icon: PaletteIcon },
  { key: "brush", label: "Дизайн", Icon: BrushIcon },
  { key: "tool", label: "Ремонт", Icon: ToolIcon },
  { key: "phone", label: "Звонки", Icon: PhoneIcon },
  { key: "mail", label: "Почта", Icon: MailIcon },
  { key: "message", label: "Сообщения", Icon: MessageIcon },
  { key: "gamepad", label: "Игры", Icon: GamepadIcon },
  { key: "camera", label: "Медиа", Icon: CameraIcon },
  { key: "gift", label: "Подарки", Icon: GiftIcon },
  { key: "shield", label: "Безопасность", Icon: ShieldIcon },
  { key: "map", label: "Места", Icon: MapIcon },
  { key: "archive", label: "Архив", Icon: ArchiveIcon },
  { key: "laptop", label: "Компьютер", Icon: LaptopIcon },
  { key: "chart", label: "Аналитика", Icon: ChartIcon },
  { key: "building", label: "Офис", Icon: BuildingIcon },
  { key: "package", label: "Посылки", Icon: PackageIcon },
  { key: "laundry", label: "Стирка", Icon: LaundryIcon },
  { key: "broom", label: "Уборка", Icon: BroomIcon },
  { key: "brain", label: "Фокус", Icon: BrainIcon },
  { key: "pen", label: "Письмо", Icon: PenIcon },
  { key: "rocket", label: "Проект", Icon: RocketIcon },
  { key: "folder", label: "Файлы", Icon: FolderIcon },
  { key: "tag", label: "Другое", Icon: TagIcon },
];

export function CategoryIcon({ name, className = "" }) {
  const icon =
    CATEGORY_ICONS.find((item) => item.key === name) ||
    (name === "plant" ? { Icon: SparkleIcon } : CATEGORY_ICONS.at(-1));
  const Icon = icon.Icon;
  return <Icon className={className} />;
}

function SunIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 7 7 0 1 0 20 15.5Z" />
    </svg>
  );
}

function HomeIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

function BookIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 0-3-3Z" />
      <path d="M5 4v13" />
      <path d="M8 7h7" />
    </svg>
  );
}

function CodeIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m8 9-4 3 4 3" />
      <path d="m16 9 4 3-4 3" />
      <path d="m14 5-4 14" />
    </svg>
  );
}

function BriefcaseIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M9 7V5h6v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function HeartIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M20.8 8.6c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.8 4.8 0 0 1 12 5a4.8 4.8 0 0 1 8.8 3.6Z" />
    </svg>
  );
}

function DumbbellIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />
    </svg>
  );
}

function CalendarIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M8 14h3M13 14h3M8 17h3" />
    </svg>
  );
}

function ClockIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CoffeeIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M5 8h10v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
      <path d="M15 9h2a2 2 0 0 1 0 4h-2" />
      <path d="M6 20h10" />
      <path d="M8 4v1M12 4v1" />
    </svg>
  );
}

function CartIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 5h2l2 10h9l2-7H8" />
      <circle cx="10" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </svg>
  );
}

function UtensilsIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10" />
      <path d="M16 3v18" />
      <path d="M16 3c3 2 4 5 2 8h-2" />
    </svg>
  );
}

function SparkleIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2Z" />
      <path d="M19 4v3M20.5 5.5h-3" />
    </svg>
  );
}

function TargetIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

function UsersIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 11a3 3 0 1 0-1-5.8" />
      <path d="M17 14a5 5 0 0 1 3.5 5" />
    </svg>
  );
}

function CarIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M5 12 7 7h10l2 5" />
      <rect x="4" y="12" width="16" height="5" rx="2" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </svg>
  );
}

function PlaneIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 11 21 4l-7 17-3-7Z" />
      <path d="m21 4-10 10" />
    </svg>
  );
}

function MusicIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

function WalletIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 7h14a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" />
      <path d="M16 13h4" />
      <circle cx="16" cy="13" r="1" />
    </svg>
  );
}

function BankIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 10h18L12 4Z" />
      <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
      <path d="M4 18h16M3 21h18" />
    </svg>
  );
}

function FileIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 3h7l4 4v14H7Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

function NoteIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M5 4h14v16H5Z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function ChecklistIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m5 7 1.5 1.5L9 6" />
      <path d="m5 13 1.5 1.5L9 12" />
      <path d="M12 8h7M12 14h7M5 20h14" />
    </svg>
  );
}

function LightbulbIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M8 14a6 6 0 1 1 8 0c-.8.7-1.2 1.5-1.2 2H9.2c0-.5-.4-1.3-1.2-2Z" />
    </svg>
  );
}

function GraduationIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 8 12 4l9 4-9 4Z" />
      <path d="M7 10v5c3 2 7 2 10 0v-5" />
      <path d="M21 8v6" />
    </svg>
  );
}

function PaletteIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.4-3.4 1.7 1.7 0 0 1 1.2-2.9H18a6 6 0 0 0-6-11.7Z" />
      <circle cx="8" cy="10" r="1" />
      <circle cx="11" cy="7" r="1" />
      <circle cx="15" cy="9" r="1" />
    </svg>
  );
}

function BrushIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M14 4 20 10 10 20H4v-6Z" />
      <path d="M13 5 19 11" />
      <path d="M4 20l6-6" />
    </svg>
  );
}

function ToolIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M14.7 6.3a4 4 0 0 0 5 5L11 20l-4-4Z" />
      <path d="M5 14 3 12l3-3 2 2" />
    </svg>
  );
}

function PhoneIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 4h10v16H7Z" />
      <path d="M11 17h2" />
    </svg>
  );
}

function MailIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function MessageIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 5h16v11H8l-4 4Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function GamepadIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 9h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.2 2L14 15h-4l-1.8 2A3 3 0 0 1 3 15v-2a4 4 0 0 1 4-4Z" />
      <path d="M7 13h4M9 11v4M16 12h.01M18 15h.01" />
    </svg>
  );
}

function CameraIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 8h4l2-3h4l2 3h4v11H4Z" />
      <circle cx="12" cy="14" r="3" />
    </svg>
  );
}

function PlantIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 21v-8" />
      <path d="M12 13c-5 0-7-3-7-8 5 0 7 3 7 8Z" />
      <path d="M12 13c5 0 7-3 7-8-5 0-7 3-7 8Z" />
    </svg>
  );
}

function LaptopIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="5" y="5" width="14" height="10" rx="2" />
      <path d="M3 19h18l-2-4H5Z" />
    </svg>
  );
}

function ChartIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="12" width="2.5" height="4" rx=".5" />
      <rect x="11" y="9" width="2.5" height="7" rx=".5" />
      <rect x="15" y="6" width="2.5" height="10" rx=".5" />
    </svg>
  );
}

function BuildingIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01M9 15h.01M15 15h.01" />
      <path d="M11 21v-4h2v4" />
    </svg>
  );
}

function PackageIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 8 12 4l8 4-8 4Z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
    </svg>
  );
}

function LaundryIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <circle cx="12" cy="14" r="4" />
      <path d="M9 7h.01M12 7h3" />
    </svg>
  );
}

function BroomIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M15 3 9 9" />
      <path d="M8 10 4 14l6 6 4-4" />
      <path d="M10 20c2-1 4-3 5-5l-6-6c-2 1-4 3-5 5" />
    </svg>
  );
}

function BrainIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3.5 3.5 0 0 0 9 19" />
      <path d="M15 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3.5 3.5 0 0 1 15 19" />
      <path d="M9 5v14M15 5v14M9 10h6M9 14h6" />
    </svg>
  );
}

function PenIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 20h4l11-11-4-4L4 16Z" />
      <path d="m13 7 4 4" />
      <path d="M12 20h8" />
    </svg>
  );
}

function RocketIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 15 9 12c1-5 4-8 10-9-1 6-4 9-9 10Z" />
      <path d="M9 12 5 13l-2 5 5-2 1-4Z" />
      <path d="M12 15 11 19l-5 2 2-5 4-1Z" />
      <circle cx="16" cy="7" r="1" />
    </svg>
  );
}

function FolderIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 6h6l2 2h8v10a2 2 0 0 1-2 2H4Z" />
      <path d="M4 6v12" />
    </svg>
  );
}

function GiftIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M3 13h18M12 9v12" />
      <path d="M12 9H8a2 2 0 1 1 2-2c0 2 2 2 2 2Z" />
      <path d="M12 9h4a2 2 0 1 0-2-2c0 2-2 2-2 2Z" />
    </svg>
  );
}

function ShieldIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

function MapIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

function ArchiveIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="4" y="5" width="16" height="4" rx="1" />
      <path d="M6 9v10h12V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

function TagIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M20 13 13 20 4 11V4h7Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  );
}
