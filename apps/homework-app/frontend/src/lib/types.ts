export interface Course {
  code: string;
  name: string;
  color: string;
}

export interface Assignment {
  id: number;
  title: string;
  courseCode: string;
  courseName: string;
  color: string;
  due: string;
  notes: string;
  source: string;
  done: boolean;
  completedAt: string | null;
  createdAt: string;
  dayLabel: string;
  timeLabel: string;
  daysUntil: number | null;
  overdue: boolean;
}

export interface AssignmentsResponse {
  assignments: Assignment[];
  overdueCount: number;
  dueTodayCount: number;
  openCount: number;
  doneCount: number;
}

export interface AssignmentInput {
  courseCode: string;
  title: string;
  due: string;
  notes?: string;
}
