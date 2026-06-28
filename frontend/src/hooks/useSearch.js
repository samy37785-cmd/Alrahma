import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useTransition } from 'react';
import { globalSearch, searchCourses, searchTeachers } from '../api/client.js';

export function useGlobalSearch(q) {
  return useQuery({
    queryKey: ['search', 'global', q],
    queryFn:  () => globalSearch(q),
    enabled:  Boolean(q && q.length >= 2),
    staleTime: 1000 * 30,
  });
}

export function useCourseSearch(params) {
  const enabled = Boolean(params.q || params.level);
  return useQuery({
    queryKey: ['search', 'courses', params],
    queryFn:  () => searchCourses(params),
    enabled,
    staleTime: 1000 * 60,
  });
}

export function useTeacherSearch(params) {
  const enabled = Boolean(params.q || params.subject || params.gender || params.language);
  return useQuery({
    queryKey: ['search', 'teachers', params],
    queryFn:  () => searchTeachers(params),
    enabled,
    staleTime: 1000 * 60,
  });
}

export function useSearchInput(debounceMs = 300) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [, startTransition] = useTransition();
  let timer;

  const onChange = useCallback((value) => {
    setQuery(value);
    clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    timer = setTimeout(() => startTransition(() => setDebouncedQuery(value)), debounceMs);
  }, [debounceMs]);

  return { query, debouncedQuery, onChange };
}
