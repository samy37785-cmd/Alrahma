import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMemoStats, updateMemoGoal, logPractice } from '../api/quranMemoApi';
import { useAuth } from '../context/AuthContext';

const MEMO_STATS_KEY = ['quran-memo-stats'];

export function useQuranMemoStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: MEMO_STATS_KEY,
    queryFn:  () => getMemoStats(),
    enabled:  !!user,
  });
}

export function useUpdateMemoGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMemoGoal,
    onSuccess:  (data) => qc.setQueryData(MEMO_STATS_KEY, data),
  });
}

export function useLogPractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logPractice,
    onSuccess:  (data) => qc.setQueryData(MEMO_STATS_KEY, data),
  });
}
