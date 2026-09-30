import { createContext, useContext, type ReactNode } from 'react';

export type ExperienceMode = 'family' | 'teacher';

export type AppTerms = {
  adult: string;
  adultLower: string;
  profile: string;
  profileLower: string;
  profiles: string;
  profilesLower: string;
  group: string;
  groupLower: string;
  workspace: string;
  workspaceLower: string;
};

const FAMILY_TERMS: AppTerms = {
  adult: 'Parent',
  adultLower: 'parent',
  profile: 'Child',
  profileLower: 'child',
  profiles: 'Children',
  profilesLower: 'children',
  group: 'Family',
  groupLower: 'family',
  workspace: 'Family',
  workspaceLower: 'family',
};

const TEACHER_TERMS: AppTerms = {
  adult: 'Teacher',
  adultLower: 'teacher',
  profile: 'Class',
  profileLower: 'class',
  profiles: 'Classes',
  profilesLower: 'classes',
  group: 'Classroom',
  groupLower: 'classroom',
  workspace: 'Classroom',
  workspaceLower: 'classroom',
};

const ClassroomModeContext = createContext<{ teacherMode: boolean; terms: AppTerms }>({
  teacherMode: false,
  terms: FAMILY_TERMS,
});

export function ClassroomModeProvider({ teacherMode, children }: { teacherMode: boolean; children: ReactNode }) {
  return (
    <ClassroomModeContext.Provider value={{ teacherMode, terms: teacherMode ? TEACHER_TERMS : FAMILY_TERMS }}>
      {children}
    </ClassroomModeContext.Provider>
  );
}

export function useClassroomMode() {
  return useContext(ClassroomModeContext);
}

export function getTerms(teacherMode: boolean) {
  return teacherMode ? TEACHER_TERMS : FAMILY_TERMS;
}
