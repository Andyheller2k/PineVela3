import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 5, // 5 seconds
      gcTime: 1000 * 60 * 10, // 10 minutes
      refetchOnWindowFocus: false, // Prevent thrashing on window focus
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

// Cross-tab broadcast synchronization channel
const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('pinevela_query_sync')
  : null;

if (syncChannel) {
  syncChannel.onmessage = (event) => {
    if (event.data?.type === 'invalidate') {
      const keys = event.data.keys;
      if (Array.isArray(keys) && keys.length > 0) {
        keys.forEach((k: any) => {
          queryClient.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] });
        });
      } else {
        queryClient.invalidateQueries();
      }
    }
  };
}

export function invalidateAllQueries(keys?: (string | string[])[]) {
  if (keys && keys.length > 0) {
    keys.forEach((k) => {
      queryClient.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] });
    });
  } else {
    queryClient.invalidateQueries();
  }

  // Notify other browser tabs
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type: 'invalidate', keys: keys || [] });
    } catch (e) {
      // Ignore serialization issues
    }
  }
}

// Global Server-Sent Events (SSE) listener for immediate push notification from Express API
let eventSource: EventSource | null = null;
let reconnectTimer: any = null;

export function setupRealtimeQuerySync() {
  if (typeof window === 'undefined') return;
  if (eventSource) return;

  function connect() {
    try {
      eventSource = new EventSource('/api/sync/events');

      eventSource.onmessage = (event) => {
        try {
          if (!event.data || event.data === 'connected') return;
          const data = JSON.parse(event.data);
          const entity = data.entity;

          if (entity) {
            queryClient.invalidateQueries({ queryKey: [entity] });

            // Invalidate mapped and aggregate queries
            if (['hostels', 'residences', 'manager', 'my-hostel'].includes(entity)) {
              queryClient.invalidateQueries({ queryKey: ['hostels'] });
              queryClient.invalidateQueries({ queryKey: ['managerData'] });
              queryClient.invalidateQueries({ queryKey: ['adminData'] });
              queryClient.invalidateQueries({ queryKey: ['userData'] });
            } else if (['booking-requests'].includes(entity)) {
              queryClient.invalidateQueries({ queryKey: ['bookingRequests'] });
              queryClient.invalidateQueries({ queryKey: ['managerData'] });
              queryClient.invalidateQueries({ queryKey: ['adminData'] });
            } else if (['issue-reports'].includes(entity)) {
              queryClient.invalidateQueries({ queryKey: ['issueReports'] });
              queryClient.invalidateQueries({ queryKey: ['residentData'] });
              queryClient.invalidateQueries({ queryKey: ['managerData'] });
              queryClient.invalidateQueries({ queryKey: ['staffData'] });
              queryClient.invalidateQueries({ queryKey: ['userData'] });
            } else if (['staff', 'staff-applications', 'staff-bargains', 'staff-reviews', 'accredited-staff'].includes(entity)) {
              queryClient.invalidateQueries({ queryKey: ['staffData'] });
              queryClient.invalidateQueries({ queryKey: ['managerData'] });
              queryClient.invalidateQueries({ queryKey: ['adminData'] });
              queryClient.invalidateQueries({ queryKey: ['residentData'] });
              queryClient.invalidateQueries({ queryKey: ['userData'] });
            } else if (['digital-market', 'orders', 'products', 'stores', 'ratings'].includes(entity)) {
              queryClient.invalidateQueries({ queryKey: ['digitalMarketData'] });
              queryClient.invalidateQueries({ queryKey: ['userData'] });
              queryClient.invalidateQueries({ queryKey: ['adminData'] });
            } else if (['notifications', 'users', 'auth'].includes(entity)) {
              queryClient.invalidateQueries({ queryKey: ['notificationsData'] });
              queryClient.invalidateQueries({ queryKey: ['userData'] });
              queryClient.invalidateQueries({ queryKey: ['managerData'] });
            } else if (['room-keys'].includes(entity)) {
              queryClient.invalidateQueries({ queryKey: ['managerData'] });
              queryClient.invalidateQueries({ queryKey: ['residentData'] });
              queryClient.invalidateQueries({ queryKey: ['userData'] });
            } else {
              queryClient.invalidateQueries();
            }
          } else {
            queryClient.invalidateQueries();
          }
        } catch (e) {
          // Ignore invalid non-JSON payloads or pings; DO NOT invalidate queries
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
      };
    } catch (e) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 5000);
    }
  }

  connect();
}
