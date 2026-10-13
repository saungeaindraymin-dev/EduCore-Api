import type { JwtPayload } from "@/utils/jwt";

export type Role = JwtPayload["role"];

export const ROLE_PERMISSIONS = {
  admin: [
    "dashboard.admin",
    "users.manage",
    "courses.manage",
    "enrollments.manage",
    "schedule.manage",
    "announcements.manage",
    "lessons.manage",

    "assignments.oversee",
    "quizzes.oversee",
  ],
  teacher: [
    "dashboard.teacher",
    "courses.view_own",
    "courses.edit_own",
    "lessons.manage_own",
    "assignments.manage_own",
    "quizzes.manage_own",
    "schedule.view_own",
    "enrollments.view_own",
    "announcements.view",
    "announcements.manage_own",
  ],
  student: [
    "dashboard.student",
    "courses.view_enrolled",
    "lessons.view_enrolled",
    "assignments.view_enrolled",
    "assignments.submit",
    "quizzes.take",
    "schedule.view_own",
    "announcements.view",
  ],
} as const satisfies Record<Role, readonly string[]>;

export type Permission = (typeof ROLE_PERMISSIONS)[Role][number];

export function hasPermission(role: Role, permission: Permission) {
  return (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission);
}

export type NavIcon =
  | "grid"
  | "users"
  | "book"
  | "clipboard"
  | "clipboard-check"
  | "check-badge"
  | "calendar"
  | "megaphone"
  | "user-group";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: NavIcon;
  permission: Permission;

  comingSoon?: boolean; 
};

export const NAVIGATION: Record<Role, NavItem[]> = {
  admin: [
    {
      key: "admin-dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: "grid",
      permission: "dashboard.admin",
    },
    {
      key: "users",
      label: "Users",
      href: "/users",
      icon: "users",
      permission: "users.manage",
    },
    {
      key: "courses",
      label: "Courses",
      href: "/courses",
      icon: "book",
      permission: "courses.manage",
    },
    {
      key: "assignments",
      label: "Assignments",
      href: "/assignments",
      icon: "clipboard-check",
      permission: "assignments.oversee",
    },
    {
      key: "enrollments",
      label: "Enrollments",
      href: "/enrollments",
      icon: "clipboard",
      permission: "enrollments.manage",
    },
    {
      key: "schedule",
      label: "Schedule",
      href: "/schedule",
      icon: "calendar",
      permission: "schedule.manage",
    },
    {
      key: "announcements",
      label: "Announcements",
      href: "/announcements",
      icon: "megaphone",
      permission: "announcements.manage",
    },
  ],
  teacher: [
    {
      key: "teacher-dashboard",
      label: "Dashboard",
      href: "/teacher",
      icon: "grid",
      permission: "dashboard.teacher",
    },
    {
      key: "teacher-courses",
      label: "My Courses",
      href: "/teacher/courses",
      icon: "book",
      permission: "courses.view_own",
    },
    {
      key: "teacher-assignments",
      label: "Assignments",
      href: "/teacher/assignments",
      icon: "clipboard-check",
      permission: "assignments.manage_own",
    },
    {
      key: "teacher-quizzes",
      label: "Quizzes",
      href: "/teacher/quizzes",
      icon: "check-badge",
      permission: "quizzes.manage_own",
    },
    {
      key: "teacher-schedule",
      label: "Schedule",
      href: "/teacher/schedule",
      icon: "calendar",
      permission: "schedule.view_own",
    },
    {
      key: "teacher-students",
      label: "Students",
      href: "/teacher/students",
      icon: "user-group",
      permission: "enrollments.view_own",
    },
    {
      key: "teacher-announcements",
      label: "Announcements",
      href: "/teacher/announcements",
      icon: "megaphone",
      permission: "announcements.view",
    },
  ],
  student: [
    {
      key: "student-dashboard",
      label: "Dashboard",
      href: "/student",
      icon: "grid",
      permission: "dashboard.student",
    },
    {
      key: "student-courses",
      label: "My Courses",
      href: "/student/courses",
      icon: "book",
      permission: "courses.view_enrolled",
    },
    {
      key: "student-assignments",
      label: "Assignments",
      href: "/student/assignments",
      icon: "clipboard-check",
      permission: "assignments.view_enrolled",
    },
    {
      key: "student-quizzes",
      label: "Quizzes",
      href: "/student/quizzes",
      icon: "check-badge",
      permission: "quizzes.take",
    },
    {
      key: "student-schedule",
      label: "Schedule",
      href: "/student/schedule",
      icon: "calendar",
      permission: "schedule.view_own",
    },
    {
      key: "student-announcements",
      label: "Announcements",
      href: "/student/announcements",
      icon: "megaphone",
      permission: "announcements.view",
    },
  ],
};
