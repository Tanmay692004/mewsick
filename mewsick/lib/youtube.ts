export type YouTubePlaylist = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  itemCount: number;
};

type YouTubePlaylistApiResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
        standard?: { url?: string };
        maxres?: { url?: string };
      };
    };
    contentDetails?: {
      itemCount?: number;
    };
  }>;
};

export async function fetchYouTubePlaylists(accessToken: string): Promise<YouTubePlaylist[]> {
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Unable to fetch YouTube playlists.');
  }

  const payload = (await response.json()) as YouTubePlaylistApiResponse;

  return (payload.items ?? []).map((playlist) => ({
    id: playlist.id,
    title: playlist.snippet?.title ?? 'Untitled playlist',
    thumbnailUrl:
      playlist.snippet?.thumbnails?.medium?.url ??
      playlist.snippet?.thumbnails?.high?.url ??
      playlist.snippet?.thumbnails?.default?.url ??
      playlist.snippet?.thumbnails?.standard?.url ??
      playlist.snippet?.thumbnails?.maxres?.url ??
      null,
    itemCount: playlist.contentDetails?.itemCount ?? 0,
  }));
}

export type YouTubeTrack = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
};

type YouTubePlaylistItemApiResponse = {
  nextPageToken?: string;
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
        standard?: { url?: string };
        maxres?: { url?: string };
      };
      resourceId?: {
        kind?: string;
        videoId?: string;
      };
    };
    contentDetails?: {
      videoId?: string;
    };
  }>;
};

export async function fetchYouTubePlaylistItems(
  accessToken: string,
  playlistId: string
): Promise<YouTubeTrack[]> {
  let tracks: YouTubeTrack[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}`;
    if (nextPageToken) {
      url += `&pageToken=${nextPageToken}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || 'Unable to fetch playlist items.');
    }

    const payload = (await response.json()) as YouTubePlaylistItemApiResponse;
    const items = payload.items ?? [];

    const mapped: YouTubeTrack[] = items.map((item) => ({
      id: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? item.id,
      title: item.snippet?.title ?? 'Untitled Track',
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.default?.url ??
        item.snippet?.thumbnails?.standard?.url ??
        item.snippet?.thumbnails?.maxres?.url ??
        null,
    }));

    tracks = [...tracks, ...mapped];
    nextPageToken = payload.nextPageToken;
  } while (nextPageToken);

  return tracks;
}
