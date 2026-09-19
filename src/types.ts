export interface User {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface UserSettings {
  userId: number;
  schoolName: string;
  serverUrl: string;
  selectedClasses: SelectedClass[];
  excludedSubjects: string[]; // subject names or IDs to filter out
  hybridSubjects?: string[]; // subject names explicitly flagged or recognized as hybrid
  calendarToken: string;
  updatedAt: string;
}

export interface SystemConfig {
  customPublicUrl: string;
}

export interface SelectedClass {
  id: number;
  name: string;
  longName?: string;
  displayName?: string;
}

export interface UntisElement {
  type: number; // 1: klasse, 2: teacher, 3: subject, 4: room
  id: number;
  name?: string;
  longName?: string;
  displayname?: string;
  backColor?: string;
  foreColor?: string;
  orgId?: number;
  missing?: boolean;
  state?: string;
}

export interface TimetableLesson {
  id: number | string; // period ID or synthetic merged ID
  lessonId: number;
  lessonNumber?: number;
  lessonCode?: string;
  lessonText?: string;
  periodText?: string;
  substText?: string;
  date: number; // YYYYMMDD format e.g. 20261012
  startTime: number; // e.g. 1400 (14:00)
  endTime: number; // e.g. 1530 (15:30)
  dateStr: string; // YYYY-MM-DD
  startTimeStr: string; // HH:mm
  endTimeStr: string; // HH:mm
  subjectName: string;
  subjectLongName: string;
  subjectId: number;
  subjectColor?: string;
  roomName: string;
  roomLongName: string;
  roomId: number;
  teacherName: string;
  teacherLongName: string;
  teacherId: number;
  className: string;
  classId: number;
  studentGroup?: string;
  cellState?: string; // STANDARD, CANCELLED, SUBSTITUTION, etc.
  isCancelled: boolean;
  isSubstitution: boolean;
  isRoomChanged: boolean;
  isHybrid?: boolean;
  originalRoomName?: string;
  originalStartTime?: number;
}

export interface NotificationItem {
  id: number;
  userId: number;
  type: 'room_change' | 'time_change' | 'cancellation' | 'substitution' | 'info';
  title: string;
  message: string;
  lessonName: string;
  oldValue?: string;
  newValue?: string;
  date: string;
  startTime: string;
  isRead: boolean;
  createdAt: string;
}

export interface SyncStatus {
  lastSync: string | null;
  nextSync: string | null;
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastError?: string;
  classesSyncedCount: number;
  totalPeriodsTracked: number;
}

export interface SemesterInfo {
  semName: string;
  startDate: string;
  endDate: string;
  weekCount: number;
  weekDates: string[];
}

export interface AvailableSubject {
  name: string;
  longName: string;
  count: number;
  firstDate?: string;
  lastDate?: string;
  isHybrid?: boolean;
}
