import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useTransition, useRef } from 'react';
import { globalSearch, searchCourses, searchTeachers } from '../api/searchApi';

export function useGlobalSearch(q) {
  return useQuery({
    queryKey: ['search', 'global', q],
    queryFn:  ({ signal }) => globalSearch(q, signal),
    enabled:  Boolean(q && q.length >= 2),
    staleTime: 1000 * 30,
  });
}

export function useCourseSearch(params) {
  const enabled = Boolean(params.q || params.level);
  return useQuery({
    queryKey: ['search', 'courses', params],
    queryFn:  ({ signal }) => searchCourses(params, signal),
    enabled,
    staleTime: 1000 * 60,
  });
}

export function useTeacherSearch(params) {
  const enabled = Boolean(params.q || params.subject || params.gender || params.language);
  return useQuery({
    queryKey: ['search', 'teachers', params],
    queryFn:  ({ signal }) => searchTeachers(params, signal),
    enabled,
    staleTime: 1000 * 60,
  });
}

export function useSearchInput(debounceMs = 300) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [, startTransition] = useTransition();
  const timerRef = useRef(null);

  const onChange = useCallback((value) => {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => startTransition(() => setDebouncedQuery(value)), debounceMs);
  }, [debounceMs]);

  return { query, debouncedQuery, onChange };
}
