import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';

WebBrowser.maybeCompleteAuthSession();

const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

export function useYouTubeAuth() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  const redirectUri = useMemo(() => AuthSession.makeRedirectUri({ scheme: 'mewsick' }), []);

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: 'YOUR_ANDROID_CLIENT_ID',
    scopes: [YOUTUBE_SCOPE],
    redirectUri,
  });

  useEffect(() => {
    if (!response) {
      return;
    }

    if (response.type === 'success') {
      const token = response.authentication?.accessToken ?? response.params?.access_token ?? null;
      setAccessToken(token);
    }

    setIsPrompting(false);
  }, [response]);

  const signIn = useCallback(async () => {
    if (!request) {
      return;
    }

    setIsPrompting(true);

    try {
      await promptAsync({ useProxy: false });
    } catch {
      setIsPrompting(false);
    }
  }, [promptAsync, request]);

  const signOut = useCallback(() => {
    setAccessToken(null);
    setIsPrompting(false);
  }, []);

  return {
    accessToken,
    isPrompting,
    isReady: Boolean(request),
    signIn,
    signOut,
  };
}
