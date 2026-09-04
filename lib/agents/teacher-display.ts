import type { Stage } from '@/lib/types/stage';

type TeacherDisplay = {
  name: string;
  avatar: string;
  gender?: 'female' | 'male';
};

export function resolveTeacherDisplay(
  fallback: TeacherDisplay,
  classroomProfile: Stage['teacherProfile'],
  classroomGender: 'female' | 'male' | undefined,
): TeacherDisplay {
  if (!classroomProfile) return fallback;
  return {
    name: classroomProfile.name,
    avatar: classroomProfile.avatar,
    ...(classroomGender ? { gender: classroomGender } : {}),
  };
}
