import { useQuery } from '@tanstack/react-query';
import { getMe } from '../api/authApi';
import { getCourses } from '../api/courseApi';
import { getMyEnrollment } from '../api/enrollmentApi';
import { COURSE_KEYS } from './useCourses';

export const DASHBOARD_KEYS = {
  me:         ['dashboard', 'me'],
  enrollment: ['dashboard', 'enrollment'],
};

export function useDashboardData(enabled = true) {
  const meQuery = useQuery({
    queryKey: DASHBOARD_KEYS.me,
    queryFn:  getMe,
    enabled,
  });

  const enrollmentQuery = useQuery({
    queryKey: DASHBOARD_KEYS.enrollment,
    queryFn:  () => getMyEnrollment().catch(() => null),
    enabled,
  });

  const coursesQuery = useQuery({
    queryKey: COURSE_KEYS.list,
    queryFn:  () => getCourses().catch(() => []),
    enabled,
  });

  return {
    me:         meQuery.data ?? null,
    enrollment: enrollmentQuery.data ?? null,
    courses:    coursesQuery.data ?? [],
    loading:    meQuery.isLoading || enrollmentQuery.isLoading || coursesQuery.isLoading,
    error:      meQuery.error || enrollmentQuery.error || coursesQuery.error,
  };
}
