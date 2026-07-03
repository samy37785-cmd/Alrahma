import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyNotifications,
  getUnreadNotifs,
  markNotifRead,
  markAllNotifsRead,
  deleteNotif,
} from '../api/notificationApi';

export const NOTIF_KEYS = {
  all:    ['notifications'],
  list:   (params) => ['notifications', 'list', params],
  unread: ['notifications', 'unread'],
};

export function useNotifications(params = {}) {
  return useQuery({
    queryKey: NOTIF_KEYS.list(params),
    queryFn:  () => getMyNotifications(params),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey:            NOTIF_KEYS.unread,
    queryFn:             getUnreadNotifs,
    refetchInterval:     30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markNotifRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotifsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}

export function useDeleteNotif() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteNotif,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}
