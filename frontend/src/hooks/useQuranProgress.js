import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReadingProgress, updatePosition, updateReadingGoal, logReading } from '../api/quranProgressApi';
import { useAuth } from '../context/AuthContext';

const PROGRESS_KEY = ['quran-progress'];

export function useReadingProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: PROGRESS_KEY,
    queryFn:  () => getReadingProgress(),
    enabled:  !!user,
  });
}

// Position updates fire frequently during playback — patch the cache
// directly instead of invalidating, so we don't trigger a refetch storm.
export function useUpdatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updatePosition,
    onSuccess:  (data) => qc.setQueryData(PROGRESS_KEY, data),
  });
}

export function useUpdateReadingGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateReadingGoal,
    onSuccess:  (data) => qc.setQueryData(PROGRESS_KEY, data),
  });
}

export function useLogReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logReading,
    onSuccess:  (data) => qc.setQueryData(PROGRESS_KEY, data),
  });
}
