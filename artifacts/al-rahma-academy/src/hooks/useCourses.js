import { useQuery } from '@tanstack/react-query';
import { getCourses } from '../api/courseApi';

export const COURSE_KEYS = {
  all:  ['courses'],
  list: ['courses', 'list'],
};

export default function useCourses() {
  const { data, isLoading, error } = useQuery({
    queryKey: COURSE_KEYS.list,
    queryFn:  getCourses,
  });

  return {
    courses: data ?? [],
    loading:  isLoading,
    error:    error?.response?.data?.message ?? error?.message ?? null,
  };
}
