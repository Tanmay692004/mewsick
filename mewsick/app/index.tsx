import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassCard } from '../components/GlassCard';
import { useYouTubeAuth } from '../hooks/useYouTubeAuth';
import { fetchYouTubePlaylists, fetchYouTubePlaylistItems, type YouTubePlaylist, type YouTubeTrack } from '../lib/youtube';
import { requestDirectoryPermission, scanLocalDirectory, matchTracks, isStorageAccessFrameworkAvailable, type LocalTrack } from '../lib/storage';
import { runDownloadQueue, type QueueItem } from '../lib/download';

export default function HomeScreen() {
  const { accessToken, isPrompting, isReady, signIn, signOut } = useYouTubeAuth();
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [isFetchingPlaylists, setIsFetchingPlaylists] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync / Diff Engine States
  const [selectedPlaylist, setSelectedPlaylist] = useState<YouTubePlaylist | null>(null);
  const [directoryUri, setDirectoryUri] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<YouTubeTrack[]>([]);
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isScanningFolder, setIsScanningFolder] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'missing' | 'offline'>('missing');
  const [isSafSupported, setIsSafSupported] = useState(true);

  // Queue / Background Download States
  const [downloadQueue, setDownloadQueue] = useState<Record<string, QueueItem>>({});
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  // Check SAF availability
  useEffect(() => {
    async function checkSaf() {
      const available = await isStorageAccessFrameworkAvailable();
      setIsSafSupported(available);
    }
    void checkSaf();
  }, []);

  // Concurrent fetch and scanning logic
  const loadSyncData = useCallback(async (playlistId: string, folderUri: string | null) => {
    if (!accessToken) return;

    setIsLoadingTracks(true);
    setIsScanningFolder(true);
    setSyncError(null);

    try {
      // 1. Fetch online playlist items
      const onlineTracks = await fetchYouTubePlaylistItems(accessToken, playlistId);
      setPlaylistTracks(onlineTracks);
      setIsLoadingTracks(false);

      // 2. Scan local folder if URI is provided
      if (folderUri) {
        let scanned: LocalTrack[] = [];
        if (folderUri.startsWith('simulated://')) {
          // Add a 500ms delay to simulate disk read
          await new Promise((resolve) => setTimeout(resolve, 500));
          // For simulated mode, match the first 30% of online tracks
          scanned = onlineTracks
            .slice(0, Math.max(1, Math.floor(onlineTracks.length / 3)))
            .map((track) => ({
              uri: `simulated://${track.id}.m4a`,
              filename: `${track.title}.m4a`,
              cleanTitle: track.title,
            }));
        } else {
          scanned = await scanLocalDirectory(folderUri);
        }
        setLocalTracks(scanned);
      } else {
        setLocalTracks([]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Error syncing playlist items.');
    } finally {
      setIsLoadingTracks(false);
      setIsScanningFolder(false);
    }
  }, [accessToken]);

  // Request directory permission handler
  const handleSelectFolder = async () => {
    try {
      const available = await isStorageAccessFrameworkAvailable();
      if (!available) {
        const mockUri = 'simulated://music-library';
        setDirectoryUri(mockUri);
        if (selectedPlaylist) {
          void loadSyncData(selectedPlaylist.id, mockUri);
        }
        return;
      }

      const uri = await requestDirectoryPermission();
      if (uri) {
        setDirectoryUri(uri);
        if (selectedPlaylist) {
          void loadSyncData(selectedPlaylist.id, uri);
        }
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Failed to authorize storage directory.');
    }
  };

  const handlePlaylistSelect = (playlist: YouTubePlaylist) => {
    setSelectedPlaylist(playlist);
    setDownloadQueue({});
    void loadSyncData(playlist.id, directoryUri);
  };

  const handleReload = () => {
    if (selectedPlaylist) {
      void loadSyncData(selectedPlaylist.id, directoryUri);
    }
  };

  // Playlists loader
  useEffect(() => {
    let isActive = true;

    async function loadPlaylists() {
      if (!accessToken) {
        setPlaylists([]);
        setErrorMessage(null);
        setIsFetchingPlaylists(false);
        return;
      }

      setIsFetchingPlaylists(true);
      setErrorMessage(null);

      try {
        const nextPlaylists = await fetchYouTubePlaylists(accessToken);

        if (isActive) {
          setPlaylists(nextPlaylists);
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load playlists.');
        }
      } finally {
        if (isActive) {
          setIsFetchingPlaylists(false);
        }
      }
    }

    void loadPlaylists();

    return () => {
      isActive = false;
    };
  }, [accessToken]);

  // Track Diff Calculations
  const { offlineTracks, missingTracks } = useMemo(() => {
    const offline: Array<{ track: YouTubeTrack; local: LocalTrack }> = [];
    const missing: YouTubeTrack[] = [];

    for (const online of playlistTracks) {
      const match = localTracks.find((local) => matchTracks(online.title, local.cleanTitle));
      if (match) {
        offline.push({ track: online, local: match });
      } else {
        missing.push(online);
      }
    }

    return { offlineTracks: offline, missingTracks: missing };
  }, [playlistTracks, localTracks]);

  // Download All Missing Tracks handler
  const handleDownloadAll = async () => {
    if (!directoryUri || missingTracks.length === 0) return;

    setIsDownloadingAll(true);
    setSyncError(null);

    try {
      await runDownloadQueue(
        missingTracks.map((t) => ({ id: t.id, title: t.title })),
        directoryUri,
        (id, update) => {
          setDownloadQueue((prev) => {
            const currentItem = prev[id];
            return {
              ...prev,
              [id]: {
                id,
                title: currentItem?.title ?? '',
                status: update.status ?? currentItem?.status ?? 'idle',
                progress: update.progress !== undefined ? update.progress : (currentItem?.progress ?? 0),
                bytesWritten: update.bytesWritten !== undefined ? update.bytesWritten : (currentItem?.bytesWritten ?? 0),
                totalBytes: update.totalBytes !== undefined ? update.totalBytes : (currentItem?.totalBytes ?? 0),
                error: update.error ?? currentItem?.error,
              },
            };
          });
        },
        2 // Max 2 concurrent downloads
      );

      // Rescan directory upon completion to match files and update list view reactive state
      if (selectedPlaylist) {
        await loadSyncData(selectedPlaylist.id, directoryUri);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Error executing download queue.');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const getFolderName = (uri: string | null) => {
    if (!uri) return 'No folder authorized';
    if (uri.startsWith('simulated://')) return 'Simulated Music Library';
    const decoded = decodeURIComponent(uri);
    const parts = decoded.split('/');
    const lastSeg = parts[parts.length - 1] || '';
    const nameParts = lastSeg.split(':');
    return nameParts[nameParts.length - 1] || 'Music Folder';
  };

  if (!isReady || isPrompting || (accessToken && isFetchingPlaylists && !selectedPlaylist)) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950">
        <View className="flex-1 items-center justify-center px-6">
          <ActivityIndicator size="large" color="#f4f4f5" />
          <Text className="mt-4 text-sm text-zinc-400">
            {isPrompting
              ? 'Connecting to Google...'
              : accessToken
                ? 'Loading your playlists...'
                : 'Preparing authentication...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!accessToken) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950">
        <View className="flex-1 items-center justify-center px-6">
          <GlassCard className="w-full max-w-md items-center px-6 py-8">
            <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <Ionicons name="musical-notes-outline" size={28} color="#f4f4f5" />
            </View>
            <Text className="text-center text-2xl font-semibold text-zinc-50">Connect YouTube Music</Text>
            <Text className="mt-3 text-center text-sm leading-6 text-zinc-400">
              Sign in with Google to load your YouTube playlists and prepare the sync dashboard.
            </Text>

            <Pressable
              onPress={signIn}
              className="mt-6 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 active:bg-white/15"
            >
              <Text className="text-base font-semibold text-white">Connect YouTube Music</Text>
            </Pressable>
          </GlassCard>
        </View>
      </SafeAreaView>
    );
  }

  // --- SYNC DETAIL VIEW ---
  if (selectedPlaylist) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950">
        {/* Header Navigation */}
        <View className="px-5 pt-6 pb-2">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => {
                setSelectedPlaylist(null);
                setPlaylistTracks([]);
                setLocalTracks([]);
                setSyncError(null);
                setDownloadQueue({});
              }}
              className="h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:bg-white/10"
            >
              <Ionicons name="arrow-back-outline" size={20} color="#f4f4f5" />
            </Pressable>

            <Text className="text-lg font-semibold text-zinc-50">Sync Dashboard</Text>

            <Pressable
              onPress={handleReload}
              disabled={isLoadingTracks || isScanningFolder || isDownloadingAll}
              className="h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:bg-white/10 disabled:opacity-50"
            >
              <Ionicons name="reload-outline" size={20} color="#f4f4f5" />
            </Pressable>
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
          {/* Playlist Info */}
          <View className="px-5 pt-3">
            <GlassCard>
              <View className="flex-row items-center gap-4">
                {selectedPlaylist.thumbnailUrl ? (
                  <Image source={{ uri: selectedPlaylist.thumbnailUrl }} className="h-16 w-16 rounded-2xl bg-white/10" />
                ) : (
                  <View className="h-16 w-16 rounded-2xl bg-white/10 items-center justify-center">
                    <Ionicons name="musical-notes" size={24} color="#a1a1aa" />
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-lg font-bold text-zinc-50" numberOfLines={1}>
                    {selectedPlaylist.title}
                  </Text>
                  <Text className="text-sm text-zinc-400 mt-0.5">
                    {selectedPlaylist.itemCount} tracks online
                  </Text>
                </View>
              </View>
            </GlassCard>
          </View>

          {/* Folder Permission Selection */}
          <View className="px-5 pt-4">
            <GlassCard>
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Local Target Directory</Text>
                  <Text className="text-sm font-semibold text-zinc-200 mt-1" numberOfLines={1}>
                    {getFolderName(directoryUri)}
                  </Text>
                  {directoryUri?.startsWith('simulated://') ? (
                    <Text className="text-[10px] text-amber-400 mt-0.5">
                      Using simulated folder (Web/iOS compatibility)
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  onPress={handleSelectFolder}
                  disabled={isDownloadingAll}
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 active:bg-white/15 disabled:opacity-50"
                >
                  <Text className="text-xs font-semibold text-white">
                    {directoryUri ? 'Change' : 'Select Folder'}
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          </View>

          {/* Sync Errors */}
          {syncError ? (
            <View className="px-5 pt-4">
              <GlassCard className="border-red-500/20 bg-red-950/20">
                <Text className="text-sm font-semibold text-red-400">Sync Error</Text>
                <Text className="text-xs text-red-300 mt-1 leading-5">{syncError}</Text>
              </GlassCard>
            </View>
          ) : null}

          {/* Loaders */}
          {isLoadingTracks || isScanningFolder ? (
            <View className="px-5 pt-8 items-center justify-center">
              <ActivityIndicator size="small" color="#f4f4f5" />
              <Text className="mt-3 text-xs text-zinc-400">
                {isLoadingTracks && isScanningFolder
                  ? 'Fetching playlist and scanning directory...'
                  : isLoadingTracks
                    ? 'Loading tracks from YouTube...'
                    : 'Scanning local storage...'}
              </Text>
            </View>
          ) : !directoryUri ? (
            /* Invite user to select folder first */
            <View className="px-5 pt-8">
              <GlassCard className="items-center py-8">
                <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <Ionicons name="folder-open-outline" size={24} color="#f4f4f5" />
                </View>
                <Text className="text-base font-semibold text-zinc-200 text-center">
                  Select Local Folder to Sync
                </Text>
                <Text className="text-xs text-zinc-400 text-center mt-2 px-4 leading-5">
                  We need folder-level permission to scan existing tracks and perform diff checks.
                </Text>

                <Pressable
                  onPress={handleSelectFolder}
                  className="mt-5 rounded-xl border border-white/10 bg-white/10 px-5 py-3 active:bg-white/15"
                >
                  <Text className="text-sm font-semibold text-white">Authorize Destination Folder</Text>
                </Pressable>
              </GlassCard>
            </View>
          ) : (
            /* Main Diff Engine State Matrix */
            <View className="pt-5">
              {/* Count Cards */}
              <View className="px-5 flex-row gap-3">
                <View className="flex-1">
                  <GlassCard className="py-4 items-center">
                    <Text className="text-xl font-bold text-zinc-50">{missingTracks.length}</Text>
                    <Text className="text-[10px] text-zinc-400 mt-1 text-center font-medium uppercase tracking-[0.1em]">Missing</Text>
                  </GlassCard>
                </View>
                <View className="flex-1">
                  <GlassCard className="py-4 items-center">
                    <Text className="text-xl font-bold text-zinc-50">{offlineTracks.length}</Text>
                    <Text className="text-[10px] text-zinc-400 mt-1 text-center font-medium uppercase tracking-[0.1em]">Offline</Text>
                  </GlassCard>
                </View>
              </View>

              {/* Tabs */}
              <View className="px-5 pt-5 flex-row gap-2">
                <Pressable
                  onPress={() => setActiveTab('missing')}
                  className={`flex-1 py-3 rounded-xl border items-center justify-center ${
                    activeTab === 'missing'
                      ? 'border-white/10 bg-white/10'
                      : 'border-transparent bg-transparent'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${activeTab === 'missing' ? 'text-white' : 'text-zinc-500'}`}>
                    Missing Locally ({missingTracks.length})
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setActiveTab('offline')}
                  className={`flex-1 py-3 rounded-xl border items-center justify-center ${
                    activeTab === 'offline'
                      ? 'border-white/10 bg-white/10'
                      : 'border-transparent bg-transparent'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${activeTab === 'offline' ? 'text-white' : 'text-zinc-500'}`}>
                    Already Offline ({offlineTracks.length})
                  </Text>
                </Pressable>
              </View>

              {/* Tabs Content */}
              <View className="px-5 pt-4">
                {activeTab === 'missing' ? (
                  <View className="gap-3">
                    {/* Primary Sync Call to Action Button */}
                    {missingTracks.length > 0 ? (
                      <Pressable
                        onPress={handleDownloadAll}
                        disabled={isDownloadingAll}
                        className="mb-2 rounded-2xl bg-white px-5 py-4 active:bg-zinc-200 disabled:opacity-50 flex-row items-center justify-center gap-2"
                      >
                        {isDownloadingAll ? (
                          <ActivityIndicator size="small" color="#09090b" />
                        ) : (
                          <Ionicons name="sync-outline" size={18} color="#09090b" />
                        )}
                        <Text className="text-sm font-bold text-zinc-950">
                          {isDownloadingAll ? 'Syncing Library...' : 'Download All Missing Tracks'}
                        </Text>
                      </Pressable>
                    ) : null}

                    {missingTracks.length === 0 ? (
                      <GlassCard className="items-center py-6">
                        <Ionicons name="checkmark-circle-outline" size={28} color="#4ade80" />
                        <Text className="text-sm font-semibold text-zinc-200 mt-3 text-center">Fully Synced!</Text>
                        <Text className="text-xs text-zinc-400 mt-1 text-center">
                          All tracks from this playlist are available offline in your folder.
                        </Text>
                      </GlassCard>
                    ) : (
                      missingTracks.map((track) => {
                        const queueItem = downloadQueue[track.id];
                        return (
                          <GlassCard key={track.id} className="py-3 px-4">
                            <View className="flex-row items-center gap-3">
                              {track.thumbnailUrl ? (
                                <Image source={{ uri: track.thumbnailUrl }} className="h-10 w-10 rounded-lg bg-white/10" />
                              ) : (
                                <View className="h-10 w-10 rounded-lg bg-white/10 items-center justify-center">
                                  <Ionicons name="musical-note" size={18} color="#a1a1aa" />
                                </View>
                              )}
                              
                              <View className="flex-1">
                                <Text className="text-sm font-semibold text-zinc-100" numberOfLines={1}>
                                  {track.title}
                                </Text>
                                
                                {queueItem ? (
                                  <View className="mt-1.5">
                                    <View className="flex-row items-center justify-between">
                                      <Text className="text-[10px] font-medium text-zinc-400 capitalize">
                                        {queueItem.status === 'downloading'
                                          ? `Downloading (${Math.round(queueItem.progress * 100)}%)`
                                          : queueItem.status === 'failed'
                                            ? `Failed: ${queueItem.error || 'Network error'}`
                                            : queueItem.status}
                                      </Text>
                                      {queueItem.totalBytes > 0 ? (
                                        <Text className="text-[9px] text-zinc-500">
                                          {(queueItem.bytesWritten / (1024 * 1024)).toFixed(1)}MB / {(queueItem.totalBytes / (1024 * 1024)).toFixed(1)}MB
                                        </Text>
                                      ) : null}
                                    </View>
                                    {/* Progress bar */}
                                    <View className="mt-1 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                                      <View
                                        className="h-full bg-zinc-300 rounded-full"
                                        style={{ width: `${queueItem.progress * 100}%` }}
                                      />
                                    </View>
                                  </View>
                                ) : (
                                  <Text className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-[0.05em]">
                                    Needs Download
                                  </Text>
                                )}
                              </View>

                              {/* Action icons */}
                              {queueItem ? (
                                queueItem.status === 'queued' ? (
                                  <Ionicons name="time-outline" size={18} color="#71717a" />
                                ) : queueItem.status === 'downloading' ? (
                                  <ActivityIndicator size="small" color="#f4f4f5" />
                                ) : queueItem.status === 'saving' ? (
                                  <Ionicons name="save-outline" size={18} color="#a1a1aa" />
                                ) : queueItem.status === 'success' ? (
                                  <Ionicons name="checkmark-circle-outline" size={18} color="#4ade80" />
                                ) : (
                                  <Ionicons name="alert-circle-outline" size={18} color="#f87171" />
                                )
                              ) : (
                                <Ionicons name="cloud-download-outline" size={18} color="#71717a" />
                              )}
                            </View>
                          </GlassCard>
                        );
                      })
                    )}
                  </View>
                ) : (
                  offlineTracks.length === 0 ? (
                    <GlassCard className="items-center py-6">
                      <Ionicons name="alert-circle-outline" size={28} color="#a1a1aa" />
                      <Text className="text-sm font-semibold text-zinc-200 mt-3 text-center">No tracks offline</Text>
                      <Text className="text-xs text-zinc-400 mt-1 text-center">
                        No matches were found in your local directory.
                      </Text>
                    </GlassCard>
                  ) : (
                    <View className="gap-3">
                      {offlineTracks.map(({ track, local }) => (
                        <GlassCard key={track.id} className="py-3 px-4">
                          <View className="flex-row items-center gap-3">
                            {track.thumbnailUrl ? (
                              <Image source={{ uri: track.thumbnailUrl }} className="h-10 w-10 rounded-lg bg-white/10" />
                            ) : (
                              <View className="h-10 w-10 rounded-lg bg-white/10 items-center justify-center">
                                <Ionicons name="musical-note" size={18} color="#a1a1aa" />
                              </View>
                            )}
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-zinc-100" numberOfLines={1}>
                                {track.title}
                              </Text>
                              <Text className="text-[10px] text-emerald-400 mt-0.5" numberOfLines={1}>
                                Matched local file: {local.filename}
                              </Text>
                            </View>
                            <Ionicons name="checkmark-circle-outline" size={18} color="#4ade80" />
                          </View>
                        </GlassCard>
                      ))}
                    </View>
                  )
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- PLAYLISTS GRID LIST VIEW ---
  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <View className="px-5 pt-6">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs uppercase tracking-[0.35em] text-zinc-500 font-semibold">mewsick</Text>
            <Text className="mt-3 text-3xl font-semibold text-zinc-50">Your playlists</Text>
          </View>

          <Pressable
            onPress={signOut}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 active:bg-white/10"
          >
            <Text className="text-sm font-medium text-zinc-100">Sign out</Text>
          </Pressable>
        </View>

        <Text className="mt-3 text-sm text-zinc-400">
          Loaded from the YouTube Data API using the readonly playlists scope.
        </Text>
      </View>

      {errorMessage ? (
        <View className="px-5 pt-5">
          <GlassCard>
            <Text className="text-base font-semibold text-white">Could not load playlists</Text>
            <Text className="mt-2 text-sm leading-6 text-zinc-300">{errorMessage}</Text>
          </GlassCard>
        </View>
      ) : null}

      <FlatList
        className="flex-1"
        contentContainerClassName="px-5 pt-5 pb-6"
        data={playlists}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View className="h-3" />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <GlassCard>
            <Text className="text-base font-semibold text-white">No playlists found</Text>
            <Text className="mt-2 text-sm leading-6 text-zinc-300">
              Your account did not return any visible playlists with the current scope.
            </Text>
          </GlassCard>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => handlePlaylistSelect(item)}>
            <GlassCard>
              <View className="flex-row items-center gap-4">
                {item.thumbnailUrl ? (
                  <Image source={{ uri: item.thumbnailUrl }} className="h-16 w-16 rounded-2xl bg-white/10" />
                ) : (
                  <View className="h-16 w-16 rounded-2xl bg-white/10 items-center justify-center">
                    <Ionicons name="musical-notes" size={24} color="#a1a1aa" />
                  </View>
                )}

                <View className="flex-1">
                  <Text className="text-base font-semibold text-zinc-50" numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text className="mt-1 text-sm text-zinc-400">{item.itemCount} tracks</Text>
                </View>
              </View>
            </GlassCard>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
