import React, { useEffect, useState, useRef } from 'react';
import { Circle, Users, Activity, TrendingUp, TrendingDown, Bell, BellOff, AlertCircle } from 'lucide-react';
import { formatValue } from '../lib/utils';
import { Entry, Unit, Workspace } from '../types';
import ContextPanel from './ContextPanel';

interface TelemetryEvent {
  id: string;
  type: 'inflow' | 'outflow' | 'join' | 'leave' | 'workspace_start' | 'level_up';
  timestamp: Date;
  message: string;
  details?: string;
  unit?: Unit;
  amount?: number;
}

interface TelemetrySidebarProps {
  workspace: Workspace;
  entries: Entry[];
  units: Unit[];
  isOpen: boolean;
  onClose: () => void;
}

type NotificationFilter = 'all' | 'inflow' | 'outflow' | 'workspace_start';

const eventToneClass: Record<TelemetryEvent['type'], string> = {
  inflow: 'bg-emerald-500',
  outflow: 'bg-blue-500',
  workspace_start: 'bg-stone-900 dark:bg-stone-100',
  join: 'bg-stone-400',
  leave: 'bg-stone-400',
  level_up: 'bg-stone-400',
};

export default function TelemetrySidebar({ workspace, entries, units, isOpen, onClose }: TelemetrySidebarProps) {
  const [now, setNow] = useState(new Date());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('telemetry_notifications');
    return saved === 'true';
  });
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>(() => {
    const saved = localStorage.getItem('telemetry_notification_filter');
    if (saved === 'inflow' || saved === 'outflow' || saved === 'workspace_start' || saved === 'all') return saved;
    if (saved === 'entry_value' || saved === 'entry_value') return 'inflow';
    if (saved === 'outflow') return 'outflow';
    return 'all';
  });
  const [highValueOnly, setHighValueOnly] = useState(() => {
    const saved = localStorage.getItem('telemetry_high_value_only');
    return saved === 'true';
  });
  const [highValueThreshold, setHighValueThreshold] = useState(() => {
    const saved = localStorage.getItem('telemetry_high_value_threshold');
    const parsed = saved ? parseFloat(saved) : 500;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
  });
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);
  const lastNotifiedEventIdRef = useRef<string | null>(null);

  // Update "now" every minute to keep duration/activity units fresh
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Persist notification setting
  useEffect(() => {
    localStorage.setItem('telemetry_notifications', notificationsEnabled.toString());
  }, [notificationsEnabled]);

  useEffect(() => {
    localStorage.setItem('telemetry_notification_filter', notificationFilter);
  }, [notificationFilter]);

  useEffect(() => {
    localStorage.setItem('telemetry_high_value_only', highValueOnly.toString());
  }, [highValueOnly]);

  useEffect(() => {
    localStorage.setItem('telemetry_high_value_threshold', highValueThreshold.toString());
  }, [highValueThreshold]);

  // Request notification permission
  const toggleNotifications = async () => {
    if (!('Notification' in window)) {
      setNotificationStatus('This browser does not support desktop notifications.');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(!notificationsEnabled);
      setNotificationStatus(!notificationsEnabled ? 'Desktop notifications enabled.' : 'Desktop notifications disabled.');
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        setNotificationStatus('Desktop notifications enabled.');
      } else {
        setNotificationsEnabled(false);
        setNotificationStatus('Notification permission was not granted.');
      }
    } else {
      setNotificationsEnabled(false);
      setNotificationStatus('Notification permission is blocked in browser settings.');
    }
  };

  // Derive events from entries and workspace data
  const events: TelemetryEvent[] = [];

  // Workspace Start
  if (workspace.start_time || workspace.created_at) {
    events.push({
      id: 'workspace-start',
      type: 'workspace_start',
      timestamp: new Date(workspace.start_time || workspace.created_at || workspace.date),
      message: 'Activity started',
      details: workspace.activity_category ? `${workspace.activity_category}${workspace.location ? ` - ${workspace.location}` : ''}` : 'Default Mode'
    });
  }

  // Entries Events
  entries.forEach(entry => {
    const unit = units.find(p => p.id === entry.unit_id);
    if (!unit) return;

    // Join / Entry value
    if (entry.created_at) {
      events.push({
        id: `join-${entry.id}`,
        type: 'inflow',
        timestamp: new Date(entry.created_at),
        message: `${unit.name} joined`,
        details: formatValue(entry.input_amount),
        unit,
        amount: entry.input_amount
      });
    }

    // Leave / Alignment
    if (entry.left_at) {
      events.push({
        id: `leave-${entry.id}`,
        type: 'outflow',
        timestamp: new Date(entry.left_at),
        message: `${unit.name} closed out`,
        details: `${formatValue(entry.output_amount)} (Net: ${entry.net > 0 ? '+' : ''}${formatValue(entry.net)})`,
        unit,
        amount: entry.output_amount
      });
    }
  });

  // Sort by timestamp descending (newest first)
  const sortedEvents = events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const latestEvent = sortedEvents[0];

  // Check for new events and trigger notification
  useEffect(() => {
    if (!latestEvent) return;

    if (!lastNotifiedEventIdRef.current) {
      lastNotifiedEventIdRef.current = latestEvent.id;
      return;
    }

    if (latestEvent.id === lastNotifiedEventIdRef.current) return;

    const passesFilter = notificationFilter === 'all' || latestEvent.type === notificationFilter;
    const passesHighValue =
      !highValueOnly ||
      (typeof latestEvent.amount === 'number' && latestEvent.amount >= highValueThreshold);

    if (
      passesFilter &&
      passesHighValue &&
      notificationsEnabled &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      (new Date().getTime() - latestEvent.timestamp.getTime() < 60000)
    ) {
      new Notification(latestEvent.message, {
        body: latestEvent.details,
      });
    }

    lastNotifiedEventIdRef.current = latestEvent.id;
  }, [latestEvent, notificationsEnabled, notificationFilter, highValueOnly, highValueThreshold]);

  useEffect(() => {
    if (!notificationStatus) return;
    const timeout = setTimeout(() => setNotificationStatus(null), 3000);
    return () => clearTimeout(timeout);
  }, [notificationStatus]);

  // --- Real-time Stats Calculation ---
  const totalInflow = entries.reduce((sum, entry) => sum + entry.input_amount, 0);
  const totalOutflow = entries.reduce((sum, entry) => sum + (entry.output_amount || 0), 0);
  const activeValue = totalInflow - totalOutflow;
  const activeUnitsCount = entries.filter(entry => !entry.left_at).length;
  const discrepancy = totalOutflow - totalInflow;
  const statCards = [
    {
      key: 'active-units',
      label: 'Participants',
      value: activeUnitsCount,
      icon: <Users size={12} />,
      valueClass: 'text-stone-900 dark:text-stone-100',
    },
    {
      key: 'total-active-value',
      label: 'Active Value',
      value: formatValue(activeValue),
      icon: <Circle size={12} />,
      valueClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'entry-total',
      label: 'Inflow',
      value: formatValue(totalInflow),
      icon: <TrendingUp size={12} />,
      valueClass: 'text-stone-900 dark:text-stone-100',
    },
    {
      key: 'settled-total',
      label: 'Outflow',
      value: formatValue(totalOutflow),
      icon: <TrendingDown size={12} />,
      valueClass: 'text-stone-900 dark:text-stone-100',
    },
    {
      key: 'total-net-delta',
      label: 'Net',
      value: formatValue(discrepancy),
      icon: <AlertCircle size={12} />,
      valueClass: Math.abs(discrepancy) < 0.01 ? 'text-stone-900 dark:text-stone-100' : 'text-red-600 dark:text-red-400',
    },
  ];

  return (
    <ContextPanel isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col h-full min-h-0">
        <div className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
          <div className="px-4 pt-4 pb-2 flex justify-between items-center">
            <h3 className="font-medium text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Activity size={18} className="text-emerald-600 dark:text-emerald-400" />
              Activity Monitor
            </h3>
            <button 
              onClick={toggleNotifications}
              className={`p-1.5 rounded-full transition-colors ${notificationsEnabled ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-200'}`}
              title={notificationsEnabled ? "Notifications On" : "Enable Notifications"}
            >
              {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
          </div>
          <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
            <select
              value={notificationFilter}
              onChange={e => setNotificationFilter(e.target.value as NotificationFilter)}
              className="text-xs rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-1"
              title="Notification Filter"
            >
              <option value="all">All Activity</option>
              <option value="inflow">Inflow Events</option>
              <option value="outflow">Outflow Events</option>
              <option value="workspace_start">Start Events</option>
            </select>
            <label className="text-xs flex items-center gap-1.5 text-stone-500 dark:text-stone-400 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={highValueOnly}
                onChange={e => setHighValueOnly(e.target.checked)}
              />
              Threshold Filter
            </label>
            <input
              type="number"
              min={0}
              step={50}
              value={highValueThreshold}
              onChange={e => {
                const next = parseFloat(e.target.value);
                setHighValueThreshold(Number.isFinite(next) && next >= 0 ? next : 0);
              }}
              disabled={!highValueOnly}
              className="w-16 min-w-0 text-xs rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-1 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
              title="Threshold value"
            />
          </div>
        </div>

        {notificationStatus && (
          <div className="mx-4 mt-3 rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 px-3 py-2 text-xs text-stone-600 dark:text-stone-300">
            {notificationStatus}
          </div>
        )}

        {/* Live Stats Grid */}
        <div className="p-4 grid grid-cols-2 gap-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50">
          {statCards.map(card => (
            <div key={card.key} className="bg-white dark:bg-stone-800 p-3 rounded-lg border border-stone-100 dark:border-stone-700 shadow-sm">
              <div className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-1 mb-1">
                {card.icon} {card.label}
              </div>
              <div className={`text-lg font-semibold ${card.valueClass}`}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-6">
          <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Timeline</h4>
          {sortedEvents.length === 0 ? (
            <div className="text-center text-stone-500 dark:text-stone-400 py-8">
              No activity recorded yet.
            </div>
          ) : (
            <div className="relative border-l border-stone-200 dark:border-stone-800 ml-3 space-y-6">
              {sortedEvents.map((event) => (
                <div key={event.id} className="relative pl-6 animate-in slide-in-from-left-2 duration-300">
                  <div className={`absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-stone-900 ${eventToneClass[event.type]}`} />
                  
                  <div className="flex flex-col">
                    <span className="text-xs text-stone-400 font-mono mb-0.5">
                      {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                      {event.message}
                    </span>
                    {event.details && (
                      <span className={`text-xs mt-0.5 ${
                        event.type === 'inflow' ? 'text-emerald-600 dark:text-emerald-400' :
                        event.type === 'outflow' ? 'text-blue-600 dark:text-blue-400' :
                        'text-stone-500 dark:text-stone-400'
                      }`}>
                        {event.details}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ContextPanel>
  );
}
