import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Handshake, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import OverlaySavingState from '../components/OverlaySavingState';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { Collaboration, Entity, Activity } from '../types';
import { cn, formatValue, parseNonNegativeNumber } from '../lib/utils';

const getProfileName = (name?: string) => name?.trim() || 'Untitled';

const sortProfilesByName = (profiles: Collaboration[]) => {
  return [...profiles].sort((left, right) => getProfileName(left.name).localeCompare(getProfileName(right.name)));
};

export default function CollaborationNetwork({ embedded = false }: { embedded?: boolean }) {
  const { notify } = useNotification();
  const { confirm } = useConfirm();
  const { canManageImpact } = useAppRole();
  const {
    collaborations: rawCollaborations,
    entities: rawEntities,
    recordsByEntityId,
    activities: rawActivities,
    addCollaboration,
    deleteCollaboration,
    updateCollaboration,
  } = useData();

  const collaborations = rawCollaborations ?? [];
  const entities = rawEntities ?? [];
  const activities = rawActivities ?? [];

  const activeProfiles = useMemo(
    () => sortProfilesByName(collaborations.filter(profile => profile.status !== 'inactive')),
    [collaborations],
  );
  const hiddenProfiles = useMemo(
    () => sortProfilesByName(collaborations.filter(profile => profile.status === 'inactive')),
    [collaborations],
  );

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddAdvancedOpen, setIsAddAdvancedOpen] = useState(false);
  const [isDetailAdvancedOpen, setIsDetailAdvancedOpen] = useState(false);
  const [isHiddenOpen, setIsHiddenOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'collaboration' | 'channel' | 'hybrid'>('channel');
  const [newParticipationFactor, setNewParticipationFactor] = useState('0');
  const [newOverheadWeight, setNewOverheadWeight] = useState('0');
  const [editParticipationFactor, setEditParticipationFactor] = useState('0');
  const [editOverheadWeight, setEditOverheadWeight] = useState('0');
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);

  type AddProfileState = 'idle' | 'saving' | 'success' | 'error';
  const [addProfileState, setAddProfileState] = useState<AddProfileState>('idle');
  const [addProfileError, setAddProfileError] = useState<string | null>(null);
  const addProfileInFlight = useRef(false);

  const selectedProfile = collaborations.find(profile => profile.id === selectedProfileId) ?? null;

  const linkedEntities = useMemo(
    () => entities.filter((entity: Entity) => entity.collaboration_id === selectedProfileId),
    [entities, selectedProfileId],
  );

  const selectedMetrics = useMemo(() => {
    if (!selectedProfile) {
      return { linked: 0, flow: 0, activities: 0 };
    }

    const activityIds = new Set<string>();
    let flow = 0;

    linkedEntities.forEach(entity => {
      const records = recordsByEntityId[entity.id] || [];
      records.forEach(record => {
        if (record.activity_id) {
          activityIds.add(record.activity_id);
        }

        if (record.status !== 'applied') return;
        if (record.direction === 'increase') {
          flow += record.unit_amount;
        }
        if (record.direction === 'decrease') {
          flow -= record.unit_amount;
        }
      });
    });

    return {
      linked: linkedEntities.length,
      flow,
      activities: activityIds.size,
    };
  }, [linkedEntities, recordsByEntityId, selectedProfile]);

  const recentLinkedActivities = useMemo(() => {
    if (!selectedProfile) return [] as Activity[];

    const activityIds = new Set<string>();
    linkedEntities.forEach(entity => {
      const records = recordsByEntityId[entity.id] || [];
      records.forEach(record => {
        if (record.activity_id) {
          activityIds.add(record.activity_id);
        }
      });
    });

    return activities
      .filter(activity => activityIds.has(activity.id))
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 4);
  }, [activities, linkedEntities, recordsByEntityId, selectedProfile]);

  useEffect(() => {
    if (selectedProfileId && collaborations.some(profile => profile.id === selectedProfileId)) {
      return;
    }

    setSelectedProfileId(activeProfiles[0]?.id ?? null);
  }, [activeProfiles, collaborations, selectedProfileId]);

  useEffect(() => {
    if (!selectedProfile) {
      setEditParticipationFactor('0');
      setEditOverheadWeight('0');
      setIsDetailAdvancedOpen(false);
      return;
    }

    setEditParticipationFactor(String(selectedProfile.participation_factor ?? 0));
    setEditOverheadWeight(String(selectedProfile.overhead_weight_pct ?? 0));
  }, [selectedProfile]);

  const resetAddForm = () => {
    setName('');
    setRole('channel');
    setNewParticipationFactor('0');
    setNewOverheadWeight('0');
    setIsAddAdvancedOpen(false);
  };

  const closeAddModal = () => {
    setIsAddOpen(false);
    setAddProfileState('idle');
    setAddProfileError(null);
    resetAddForm();
  };

  const handleAddProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageImpact || addProfileInFlight.current) return;

    addProfileInFlight.current = true;
    setAddProfileError(null);
    setAddProfileState('saving');

    try {
      const newId = await addCollaboration({
        name,
        collaboration_type: role,
        participation_factor: parseNonNegativeNumber(newParticipationFactor),
        overhead_weight_pct: parseNonNegativeNumber(newOverheadWeight),
        rules: {},
      });
      notify({ type: 'success', message: 'Profile added.' });
      setAddProfileState('success');
      setTimeout(() => {
        setIsAddOpen(false);
        setAddProfileState('idle');
        resetAddForm();
        setSelectedProfileId(newId);
      }, 700);
    } catch (error: any) {
      const msg = error?.message || 'Unable to add profile.';
      notify({ type: 'error', message: msg });
      setAddProfileError(msg);
      setAddProfileState('error');
    } finally {
      addProfileInFlight.current = false;
    }
  };

  const handleSaveAdvanced = async () => {
    if (!canManageImpact || !selectedProfile) return;

    try {
      await updateCollaboration({
        ...selectedProfile,
        participation_factor: parseNonNegativeNumber(editParticipationFactor),
        overhead_weight_pct: parseNonNegativeNumber(editOverheadWeight),
      });
      notify({ type: 'success', message: 'Profile updated.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update profile.' });
    }
  };

  const handleRestoreProfile = async (profileId: string) => {
    if (!canManageImpact) return;

    const profile = collaborations.find(item => item.id === profileId);
    if (!profile || profile.status !== 'inactive') return;

    try {
      await updateCollaboration({ ...profile, status: 'active' });
      setSelectedProfileId(profileId);
      notify({ type: 'success', message: 'Profile restored.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to restore profile.' });
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!canManageImpact || deletingProfileId === profileId) return;

    const ok = await confirm({
      title: 'Remove network profile?',
      message: 'Remove this profile permanently? This cannot be undone.',
      danger: true,
      confirmLabel: 'Remove',
    });
    if (!ok) return;

    try {
      setDeletingProfileId(profileId);
      await deleteCollaboration(profileId);
      if (selectedProfileId === profileId) {
        setSelectedProfileId(null);
      }
      notify({ type: 'success', message: 'Profile removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove profile.' });
    } finally {
      setDeletingProfileId(current => (current === profileId ? null : current));
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'page-shell animate-in fade-in space-y-4'}>
      {!canManageImpact && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
          Read-only
        </div>
      )}

      {!embedded && (
        <div className="section-card flex items-center justify-between gap-4 p-5 lg:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-stone-200 bg-stone-100 shadow-sm dark:border-stone-700 dark:bg-stone-800">
              <Handshake size={24} className="text-stone-900 dark:text-stone-100" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Network</h2>
          </div>
          {activeProfiles.length > 0 && (
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              disabled={!canManageImpact}
              className="action-btn-primary disabled:opacity-50"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>
      )}

      {activeProfiles.length === 0 ? (
        <div className="section-card flex min-h-[280px] flex-col items-center justify-center gap-5 p-8 text-center">
          {!embedded && <h3 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Network</h3>}
          <p className="text-lg text-stone-500 dark:text-stone-400">No profiles</p>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            disabled={!canManageImpact}
            className="action-btn-primary disabled:opacity-50"
          >
            <Plus size={16} />
            Add
          </button>

          {hiddenProfiles.length > 0 && (
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-stone-50/80 p-3 text-left dark:border-stone-800 dark:bg-stone-900/60">
              <button
                type="button"
                onClick={() => setIsHiddenOpen(value => !value)}
                className="flex w-full items-center justify-between text-sm font-semibold text-stone-700 dark:text-stone-200"
              >
                Hidden
                <ChevronDown size={16} className={cn('transition-transform', isHiddenOpen ? 'rotate-180' : '')} />
              </button>
              {isHiddenOpen && (
                <div className="mt-3 space-y-2">
                  {hiddenProfiles.map(profile => (
                    <div key={profile.id} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-3 dark:border-stone-800 dark:bg-stone-950">
                      <button
                        type="button"
                        onClick={() => setSelectedProfileId(profile.id)}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-stone-900 dark:text-stone-100"
                      >
                        {getProfileName(profile.name)}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleRestoreProfile(profile.id); }}
                        disabled={!canManageImpact}
                        className="action-btn-tertiary px-2 py-1 text-xs disabled:opacity-50"
                      >
                        <RotateCcw size={12} />
                        Show
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="section-card p-3">
            <div className="space-y-2">
              {activeProfiles.map(profile => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedProfileId(profile.id)}
                  className={cn(
                    'w-full rounded-2xl border px-4 py-4 text-left text-base font-medium transition-all',
                    selectedProfileId === profile.id
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
                      : 'border-stone-200 bg-white text-stone-900 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800/80',
                  )}
                >
                  <span className="block truncate">{getProfileName(profile.name)}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              disabled={!canManageImpact}
              className="mt-3 w-full rounded-2xl border border-dashed border-stone-300 px-4 py-4 text-left text-base font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800/70"
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={18} />
                Add
              </span>
            </button>

            {hiddenProfiles.length > 0 && (
              <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-800 dark:bg-stone-900/60">
                <button
                  type="button"
                  onClick={() => setIsHiddenOpen(value => !value)}
                  className="flex w-full items-center justify-between text-sm font-semibold text-stone-700 dark:text-stone-200"
                >
                  Hidden
                  <ChevronDown size={16} className={cn('transition-transform', isHiddenOpen ? 'rotate-180' : '')} />
                </button>
                {isHiddenOpen && (
                  <div className="mt-3 space-y-2">
                    {hiddenProfiles.map(profile => (
                      <div key={profile.id} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-3 dark:border-stone-800 dark:bg-stone-950">
                        <button
                          type="button"
                          onClick={() => setSelectedProfileId(profile.id)}
                          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-stone-900 dark:text-stone-100"
                        >
                          {getProfileName(profile.name)}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleRestoreProfile(profile.id); }}
                          disabled={!canManageImpact}
                          className="action-btn-tertiary px-2 py-1 text-xs disabled:opacity-50"
                        >
                          <RotateCcw size={12} />
                          Show
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="section-card overflow-hidden">
            {selectedProfile ? (
              <>
                <div className="border-b border-stone-200 px-5 py-5 dark:border-stone-800 lg:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">{getProfileName(selectedProfile.name)}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedProfile.status === 'inactive' && (
                        <button
                          type="button"
                          onClick={() => { void handleRestoreProfile(selectedProfile.id); }}
                          disabled={!canManageImpact}
                          className="action-btn-secondary disabled:opacity-50"
                        >
                          <RotateCcw size={14} />
                          Show
                        </button>
                      )}
                      {canManageImpact && (
                        <button
                          type="button"
                          onClick={() => { void handleDeleteProfile(selectedProfile.id); }}
                          disabled={deletingProfileId === selectedProfile.id}
                          className="action-btn-tertiary text-red-600 dark:text-red-400 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          {deletingProfileId === selectedProfile.id ? 'Removing' : 'Remove permanently'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5 lg:p-6">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <BasicMetric label="Linked" value={String(selectedMetrics.linked)} />
                    <BasicMetric label="Flow" value={formatValue(selectedMetrics.flow)} tone={selectedMetrics.flow > 0 ? 'positive' : selectedMetrics.flow < 0 ? 'negative' : 'neutral'} />
                    <BasicMetric label="Activities" value={String(selectedMetrics.activities)} />
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Entities linked</h4>
                    {linkedEntities.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-sm text-stone-500 dark:border-stone-800 dark:text-stone-400">
                        None
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {linkedEntities.map(entity => (
                          <div key={entity.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
                            {entity.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Basic info</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InfoCard label="State" value={selectedProfile.status === 'inactive' ? 'Inactive' : 'Active'} />
                      <InfoCard label="Total" value={formatValue(selectedProfile.total_number ?? 0)} />
                    </div>
                  </div>

                  {recentLinkedActivities.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Recent</h4>
                      <div className="space-y-2">
                        {recentLinkedActivities.map(activity => (
                          <div key={activity.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm dark:border-stone-800 dark:bg-stone-900">
                            <div className="font-medium text-stone-900 dark:text-stone-100">{activity.label}</div>
                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{new Date(activity.date).toLocaleDateString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/60">
                    <button
                      type="button"
                      onClick={() => setIsDetailAdvancedOpen(value => !value)}
                      className="flex w-full items-center justify-between text-sm font-semibold text-stone-700 dark:text-stone-200"
                    >
                      Advanced
                      <ChevronDown size={16} className={cn('transition-transform', isDetailAdvancedOpen ? 'rotate-180' : '')} />
                    </button>

                    {isDetailAdvancedOpen && (
                      <div className="mt-4 space-y-4 border-t border-stone-200 pt-4 dark:border-stone-800">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Profile type</label>
                            <select
                              className="control-input"
                              value={selectedProfile.collaboration_type || 'channel'}
                              onChange={event => {
                                void updateCollaboration({
                                  ...selectedProfile,
                                  collaboration_type: event.target.value,
                                }).then(() => {
                                  notify({ type: 'success', message: 'Profile updated.' });
                                }).catch((error: any) => {
                                  notify({ type: 'error', message: error?.message || 'Unable to update profile.' });
                                });
                              }}
                              disabled={!canManageImpact}
                            >
                              <option value="channel">Reserve / flow routing</option>
                              <option value="collaboration">Partnership</option>
                              <option value="hybrid">Hybrid</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Factor</label>
                            <input
                              className="control-input"
                              type="number"
                              step="0.01"
                              value={editParticipationFactor}
                              onChange={event => setEditParticipationFactor(event.target.value)}
                              disabled={!canManageImpact}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Overhead</label>
                            <input
                              className="control-input"
                              type="number"
                              step="0.1"
                              value={editOverheadWeight}
                              onChange={event => setEditOverheadWeight(event.target.value)}
                              disabled={!canManageImpact}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => { void handleSaveAdvanced(); }}
                            disabled={!canManageImpact}
                            className="action-btn-primary disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center px-6 text-sm text-stone-500 dark:text-stone-400">
                Select a profile
              </div>
            )}
          </section>
        </div>
      )}

      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => {
            if (addProfileState === 'saving' || addProfileState === 'success') return;
            closeAddModal();
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={cn(
              'w-full max-w-md rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-950 animate-in zoom-in-95 transition-shadow duration-300',
              addProfileState === 'success' && 'ring-2 ring-emerald-400 dark:ring-emerald-500'
            )}
          >
            {/* ── SAVING ── */}
            {addProfileState === 'saving' && <OverlaySavingState state="saving" label="Adding profile…" />}

            {/* ── SUCCESS ── */}
            {addProfileState === 'success' && <OverlaySavingState state="success" label="Profile added" />}

            {/* ── IDLE / ERROR ── */}
            {(addProfileState === 'idle' || addProfileState === 'error') && (
              <form onSubmit={handleAddProfile} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Add profile</h3>
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                {addProfileState === 'error' && addProfileError && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    {addProfileError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-200">Name</label>
                  <input
                    className="control-input"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    autoFocus
                    required
                  />
                </div>

                <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-800 dark:bg-stone-900/60">
                  <button
                    type="button"
                    onClick={() => setIsAddAdvancedOpen(value => !value)}
                    className="flex w-full items-center justify-between text-sm font-semibold text-stone-700 dark:text-stone-200"
                  >
                    Advanced
                    <ChevronDown size={16} className={cn('transition-transform', isAddAdvancedOpen ? 'rotate-180' : '')} />
                  </button>

                  {isAddAdvancedOpen && (
                    <div className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Profile type</label>
                        <select className="control-input" value={role} onChange={event => setRole(event.target.value as 'collaboration' | 'channel' | 'hybrid')}>
                          <option value="channel">Reserve / flow routing</option>
                          <option value="collaboration">Partnership</option>
                          <option value="hybrid">Hybrid</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Factor</label>
                          <input className="control-input" type="number" step="0.01" value={newParticipationFactor} onChange={event => setNewParticipationFactor(event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Overhead</label>
                          <input className="control-input" type="number" step="0.1" value={newOverheadWeight} onChange={event => setNewOverheadWeight(event.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeAddModal} className="action-btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={!canManageImpact} className="action-btn-primary disabled:opacity-50">
                    <Plus size={16} />
                    {addProfileState === 'error' ? 'Try again' : 'Add'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BasicMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'positive' | 'negative' }) {
  const toneClass = tone === 'positive'
    ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'negative'
      ? 'text-red-700 dark:text-red-300'
      : 'text-stone-900 dark:text-stone-100';

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold', toneClass)}>{value}</div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-stone-900 dark:text-stone-100">{value}</div>
    </div>
  );
}