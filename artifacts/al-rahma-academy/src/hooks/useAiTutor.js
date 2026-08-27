import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTutorConversations,
  createTutorConversation,
  getTutorConversation,
  deleteTutorConversation,
} from '../api/aiTutorApi';

const CONVERSATIONS_KEY = ['ai-tutor', 'conversations'];

export function useTutorConversations() {
  return useQuery({ queryKey: CONVERSATIONS_KEY, queryFn: listTutorConversations });
}

export function useTutorConversation(id) {
  return useQuery({
    queryKey: ['ai-tutor', 'conversation', id],
    queryFn: () => getTutorConversation(id),
    enabled: !!id,
  });
}

export function useCreateTutorConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTutorConversation,
    onSuccess: () => qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  });
}

export function useDeleteTutorConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTutorConversation,
    onSuccess: () => qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  });
}
