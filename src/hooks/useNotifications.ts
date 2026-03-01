// TODO: Stage 6 — Hook for notification system
export function useNotifications() {
    return { permission: 'default' as const, notifications: [], unreadCount: 0 };
}
