import {
  House, Inbox, Bot, Wallet, LayoutTemplate, Wrench,
  BookOpen, Settings, MessageSquarePlus,
} from "lucide-react";

// Nav items dùng chung cho Sidebar desktop và bottom tab bar / More sheet mobile —
// đổi icon/label ở đây là cả hai nơi cùng cập nhật, tránh lệch nhau theo thời gian.

export interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
}

export const primaryNavItems: NavItem[] = [
  { id: "dashboard", icon: House,  label: "Tổng quan" },
  { id: "portfolio", icon: Wallet, label: "Danh mục" },
  { id: "inbox",     icon: Inbox,  label: "Hộp thư" },
  { id: "agents",    icon: Bot,    label: "Agent của tôi" },
];

export const studioNavItems: NavItem[] = [
  { id: "templates", icon: LayoutTemplate, label: "Mẫu Agent" },
  { id: "tools",     icon: Wrench,         label: "Thư viện công cụ" },
  { id: "knowledge", icon: BookOpen,       label: "Kho kiến thức" },
];

export const accountNavItems: NavItem[] = [
  { id: "settings", icon: Settings,          label: "Cài đặt" },
  { id: "feedback", icon: MessageSquarePlus, label: "Gửi phản hồi" },
];
