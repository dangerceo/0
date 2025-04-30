import { useEffect, useRef, useState, useCallback, ReactNode, useMemo } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { Input } from "@/components/ui/input";
import { InternetExplorerMenuBar } from "./InternetExplorerMenuBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, History, Share } from "lucide-react";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import HtmlPreview from "@/components/shared/HtmlPreview";
import { motion, AnimatePresence } from "framer-motion";
import { useAiGeneration } from "../hooks/useAiGeneration";
import { useInternetExplorerStore, DEFAULT_FAVORITES, ErrorResponse, LanguageOption, LocationOption } from "@/stores/useInternetExplorerStore";
import FutureSettingsDialog from "@/components/dialogs/FutureSettingsDialog";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import { track } from "@vercel/analytics";
import { useAppStore } from "@/stores/useAppStore";
import TimeMachineView from "./TimeMachineView";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { toast } from "sonner";

// Analytics event namespace for Internet Explorer events
export const IE_ANALYTICS = {
  NAVIGATION_START: "internet-explorer:navigation_start",
  NAVIGATION_ERROR: "internet-explorer:navigation_error",
  NAVIGATION_SUCCESS: "internet-explorer:navigation_success",
};

// Helper function to get language display name
const getLanguageDisplayName = (lang: LanguageOption): string => {
  const languageMap: Record<LanguageOption, string> = {
    auto: "Auto-detected",
    english: "English",
    chinese: "Chinese (Traditional)",
    japanese: "Japanese",
    korean: "Korean",
    french: "French",
    spanish: "Spanish",
    portuguese: "Portuguese",
    german: "German",
    sanskrit: "Sanskrit",
    latin: "Latin",
    alien: "Alien Language",
    ai_language: "AI Language",
    digital_being: "Digital Being Language"
  };
  return languageMap[lang] || "Auto-detected";
};

// Helper function to get location display name
const getLocationDisplayName = (loc: LocationOption): string => {
  const locationMap: Record<LocationOption, string> = {
    auto: "Auto-detected",
    united_states: "United States",
    china: "China",
    japan: "Japan",
    korea: "South Korea",
    france: "France",
    spain: "Spain",
    portugal: "Portugal",
    germany: "Germany",
    canada: "Canada",
    uk: "United Kingdom",
    india: "India",
    brazil: "Brazil",
    australia: "Australia",
    russia: "Russia"
  };
  return locationMap[loc] || "Auto-detected";
};

interface ErrorPageProps {
  title: string;
  primaryMessage: string;
  secondaryMessage?: string;
  suggestions: (string | ReactNode)[];
  details?: string;
  footerText: string;
  showGoBackButtonInSuggestions?: boolean;
  onGoBack: () => void;
  onRetry?: () => void;
}

function ErrorPage({
  title,
  primaryMessage,
  secondaryMessage,
  suggestions,
  details,
  footerText,
  showGoBackButtonInSuggestions = true,
  onGoBack,
  onRetry,
}: ErrorPageProps) {
  return (
    <div className="p-6 font-geneva-12 text-sm h-full overflow-y-auto">
      <h1 className="text-lg mb-4 font-normal flex items-center">{title}</h1>

      <p className="mb-3">{primaryMessage}</p>
      {secondaryMessage && <p className="mb-3">{secondaryMessage}</p>}

      <div className="h-px bg-gray-300 my-5"></div>

      <p className="mb-3">Please try the following:</p>

      <ul className="list-disc pl-6 mb-5 space-y-2">
        {suggestions.map((suggestion, index) => (
          <li key={index}>
            {typeof suggestion === 'string' && suggestion.includes('{hostname}') ? (
              suggestion.split('{hostname}').map((part, i) => 
                i === 0 ? part : <><a href={`https://${details}`} target="_blank" rel="noopener noreferrer" className="text-red-600 underline">{details}</a>{part}</>
              )
            ) : typeof suggestion === 'string' && suggestion.includes('{backButton}') && showGoBackButtonInSuggestions ? (
              suggestion.split('{backButton}').map((part, i) => 
                i === 0 ? part : <><a href="#" role="button" onClick={(e) => { e.preventDefault(); onGoBack(); }} className="text-red-600 underline">Back</a>{part}</>
              )
            ) : typeof suggestion === 'string' && suggestion.includes('{refreshButton}') && onRetry ? (
              suggestion.split('{refreshButton}').map((part, i) =>
                i === 0 ? part : <><a href="#" role="button" onClick={(e) => { e.preventDefault(); onRetry(); }} className="text-red-600 underline">Refresh</a>{part}</>
              )
            ) : (
              suggestion
            )}
          </li>
        ))}
      </ul>

      {details && !footerText.includes('HTTP') && (
        <div className="p-3 bg-gray-100 border border-gray-300 rounded mb-5">
          {details}
        </div>
      )}

      <div className="mt-10 text-gray-700 whitespace-pre-wrap">
        {footerText}
      </div>
    </div>
  );
}

// Add this constant for title truncation
const MAX_TITLE_LENGTH = 50;

// Add these utility functions after the imports and before the component
const getHostnameFromUrl = (url: string): string => {
  try {
    const urlToUse = url.startsWith("http") ? url : `https://${url}`;
    return new URL(urlToUse).hostname;
  } catch {
    return url; // Return original if parsing fails
  }
};

const formatTitle = (title: string): string => {
  if (!title) return "Internet Explorer";
  return title.length > MAX_TITLE_LENGTH 
    ? title.substring(0, MAX_TITLE_LENGTH) + "..."
    : title;
};

const getLoadingTitle = (baseTitle: string): string => {
  // If it looks like a URL, extract the hostname
  const titleToUse = baseTitle.includes("/") || baseTitle.includes(".") 
    ? getHostnameFromUrl(baseTitle)
    : baseTitle;
  
  const formattedTitle = formatTitle(titleToUse);
  return formattedTitle === "Internet Explorer" 
    ? "Internet Explorer - Loading" 
    : `${formattedTitle} - Loading`;
};

// Helper function to decode Base64 data (client-side)
function decodeData(code: string): { url: string; year: string } | null {
  try {
    // Replace URL-safe characters back to standard Base64
    const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const paddedBase64 = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const decoded = atob(paddedBase64);
    
    // Try compact format first (url|year)
    const [url, year] = decoded.split('|');
    if (typeof url === 'string' && typeof year === 'string') {
      return { url, year };
    }

    // If compact format fails, try JSON format
    try {
      const data = JSON.parse(decoded);
      if (typeof data.url === 'string' && typeof data.year === 'string') {
        return { url: data.url, year: data.year };
      }
    } catch (jsonError) {
      console.debug("[IE] Failed to parse as JSON, not a valid share code format");
    }

    console.error("[IE] Decoded data structure invalid:", { url, year });
    return null;
  } catch (error) {
    console.error("[IE] Error decoding share code:", error);
    return null;
  }
}

export function InternetExplorerAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  helpItems,
  initialData,
}: AppProps) {
  const debugMode = useAppStore(state => state.debugMode);
  const terminalSoundsEnabled = useAppStore(state => state.terminalSoundsEnabled);
  const bringToForeground = useAppStore(state => state.bringToForeground);

  const {
    url, year, mode, token, favorites, history, historyIndex,
    isTitleDialogOpen, newFavoriteTitle, isHelpDialogOpen, isAboutDialogOpen,
    isNavigatingHistory, isClearFavoritesDialogOpen, isClearHistoryDialogOpen, currentPageTitle,
    timelineSettings, status, finalUrl, aiGeneratedHtml,
    errorDetails, 
    isResetFavoritesDialogOpen,
    isFutureSettingsDialogOpen,
    language,
    location,
    isTimeMachineViewOpen,

    setUrl, setYear, navigateStart, setFinalUrl, loadSuccess, loadError, cancel,
    addFavorite, clearFavorites, setHistoryIndex, clearHistory,
    setTitleDialogOpen, setNewFavoriteTitle, setHelpDialogOpen,
    setAboutDialogOpen, setNavigatingHistory, setClearFavoritesDialogOpen,
    setClearHistoryDialogOpen,
    handleNavigationError,
    setPrefetchedTitle,
    clearErrorDetails,
    setResetFavoritesDialogOpen,
    setFutureSettingsDialogOpen,
    getCachedAiPage, cacheAiPage,
    setLanguage,
    setLocation,
    cachedYears,
    isFetchingCachedYears,
    setTimeMachineViewOpen,
    fetchCachedYears,
  } = useInternetExplorerStore();

  const abortControllerRef = useRef<AbortController | null>(null);
  const [hasMoreToScroll] = useState(false);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const favoritesContainerRef = useRef<HTMLDivElement>(null);

  const {
    generateFuturisticWebsite,
    aiGeneratedHtml: generatedHtml,
    isAiLoading,
    isFetchingWebsiteContent,
    stopGeneration
  } = useAiGeneration({ 
    onLoadingChange: () => {}, 
    customTimeline: timelineSettings 
  });

  const { playElevatorMusic, stopElevatorMusic, playDingSound } = useTerminalSounds();

  const currentYear = new Date().getFullYear();
  const pastYears = [
    "1000 BC", "1 CE", "500", "800", "1000", "1200", "1400", "1600", "1700", "1800", "1900",
    "1910", "1920", "1930", "1940", "1950", "1960", "1970", "1980", "1985", "1990",
    ...Array.from(
      { length: currentYear - 1991 + 1 },
      (_, i) => (1991 + i).toString()
    ).filter(year => parseInt(year) !== currentYear)
  ].reverse();
  const futureYears = [
    ...Array.from(
      { length: 8 }, 
      (_, i) => (2030 + i * 10).toString()
    ).filter(year => parseInt(year) !== currentYear),
    "2150", "2200", "2250", "2300", "2400", "2500", "2750", "3000"
  ].sort((a, b) => parseInt(b) - parseInt(a));

  const [displayTitle, setDisplayTitle] = useState<string>("Internet Explorer");
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  // Fetch cached years when URL changes (No debouncing for now)
  // const debouncedUrl = useDebounce(url, 500); // Debounce URL changes by 500ms
  
  const cachedYearsFetchedRef = useRef<{[url: string]: boolean}>({});
  useEffect(() => {
    if (url && !cachedYearsFetchedRef.current[url]) {
      console.log(`[IE] Fetching cached years for URL: ${url}`);
      cachedYearsFetchedRef.current[url] = true;
      fetchCachedYears(url);
    }
  }, [url, fetchCachedYears]);

  useEffect(() => {
    let newTitle = "Internet Explorer";
    const baseTitle = currentPageTitle || url;
    const isTimeTravelling = status === 'loading' && year !== 'current';

    if (isTimeTravelling) {
      const titleToUse = baseTitle.includes("/") || baseTitle.includes(".") 
        ? getHostnameFromUrl(baseTitle)
        : baseTitle;
      const formattedTitle = formatTitle(titleToUse);
      newTitle = formattedTitle === "Internet Explorer" 
        ? "Internet Explorer - Travelling" 
        : `${formattedTitle} - Travelling`;
    } else if (status === "loading") {
      newTitle = getLoadingTitle(baseTitle);
    } else if (currentPageTitle) {
      newTitle = formatTitle(currentPageTitle);
    } else if (finalUrl) {
      try {
        const urlToParse = finalUrl.startsWith("http") || finalUrl.startsWith("/") ? finalUrl : `https://${finalUrl}`;
        const effectiveUrl = urlToParse.startsWith('/api/iframe-check') ? url : urlToParse; 
        const hostname = new URL(effectiveUrl).hostname;
        newTitle = formatTitle(hostname);
      } catch {
        try {
          const fallbackHostname = getHostnameFromUrl(url);
          newTitle = formatTitle(fallbackHostname);
        } catch {
          console.debug("[IE] Failed to parse both finalUrl and url for title:", finalUrl, url);
          newTitle = "Internet Explorer";
        }
      }
    }

    setDisplayTitle(newTitle);
  }, [status, currentPageTitle, finalUrl, url, year]); 

  const getWaybackUrl = async (targetUrl: string, year: string) => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const formattedUrl = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;
    console.log(`[IE] Using Wayback Machine URL for ${formattedUrl} in ${year}`);
    return `/api/iframe-check?url=${encodeURIComponent(formattedUrl)}&year=${year}&month=${month}`;
  };

  // Ref to keep the most recent navigation token in sync without waiting for a render
  const navTokenRef = useRef<number>(0);

  const handleIframeLoad = async () => {
    if (iframeRef.current && iframeRef.current.dataset.navToken === navTokenRef.current.toString()) {
      const iframeSrc = iframeRef.current.src;
      if (iframeSrc.includes('/api/iframe-check') && iframeRef.current.contentDocument) {
        try {
          const textContent = iframeRef.current.contentDocument.body?.textContent?.trim();
          if (textContent) {
            try {
              const potentialErrorData = JSON.parse(textContent) as ErrorResponse;
              if (potentialErrorData && potentialErrorData.error === true && potentialErrorData.type) {
                console.log('[IE] Detected JSON error response in iframe body:', potentialErrorData);
                track(IE_ANALYTICS.NAVIGATION_ERROR, {
                  url: iframeSrc,
                  type: potentialErrorData.type,
                  status: potentialErrorData.status || 500,
                  message: potentialErrorData.message,
                });
                handleNavigationError(potentialErrorData, url);
                return;
              }
            } catch (parseError) {
              console.debug('[IE] Iframe body content was not a JSON error:', parseError);
            }
          }

          const contentType = iframeRef.current.contentDocument.contentType;
          if (contentType === 'application/json') {
              const text = iframeRef.current.contentDocument.body.textContent;
              if (text) {
                  const errorData = JSON.parse(text) as ErrorResponse;
                  if (errorData.error) {
                      console.log('[IE] Detected error response (via content-type check):', errorData);
                      track(IE_ANALYTICS.NAVIGATION_ERROR, {
                          url: iframeSrc,
                          type: errorData.type,
                          status: errorData.status || 500,
                      });
                      handleNavigationError(errorData, url);
                      return;
                  }
              }
          }
        } catch (error) {
          console.warn('[IE] Error processing iframe content:', error);
        }
      }

      clearErrorDetails();

      setTimeout(() => {
        if (iframeRef.current && iframeRef.current.dataset.navToken === navTokenRef.current.toString()) {
          let loadedTitle: string | null = null;
          const currentUrlForFallback = url;
          const fallbackTitle = currentUrlForFallback ? new URL(currentUrlForFallback.startsWith("http") ? currentUrlForFallback : `https://${currentUrlForFallback}`).hostname : "Internet Explorer";

          try {
            loadedTitle = iframeRef.current?.contentDocument?.title || null;
            if (loadedTitle) {
              const txt = document.createElement("textarea");
              txt.innerHTML = loadedTitle;
              loadedTitle = txt.value.trim();
            }
          } catch (error) {
            console.warn("[IE] Failed to read iframe document title directly:", error);
          }

          if (!loadedTitle && finalUrl?.startsWith('/api/iframe-check')) {
            try {
              const metaTitle = iframeRef.current?.contentDocument?.querySelector('meta[name="page-title"]')?.getAttribute('content');
              if (metaTitle) {
                loadedTitle = decodeURIComponent(metaTitle);
              }
            } catch (error) {
              console.warn("[IE] Failed to read page-title meta tag:", error);
            }
          }

          const favicon = `https://www.google.com/s2/favicons?domain=${new URL(currentUrlForFallback.startsWith("http") ? currentUrlForFallback : `https://${currentUrlForFallback}`).hostname}&sz=32`;
          
          track(IE_ANALYTICS.NAVIGATION_SUCCESS, {
            url: currentUrlForFallback,
            year: year,
            mode: mode,
            title: loadedTitle || fallbackTitle,
          });

          loadSuccess({
            title: loadedTitle || fallbackTitle,
            targetUrl: currentUrlForFallback,
            targetYear: year,
            favicon: favicon,
            addToHistory: !isNavigatingHistory
          });
        }
      }, 50);
    }
  };

  const handleIframeError = () => {
    if (iframeRef.current && iframeRef.current.dataset.navToken === navTokenRef.current.toString()) {
      setTimeout(() => {
        if (iframeRef.current && iframeRef.current.dataset.navToken === navTokenRef.current.toString()) {
          try {
            const targetUrlForError = finalUrl || url;
            track(IE_ANALYTICS.NAVIGATION_ERROR, {
              url: targetUrlForError,
              type: "connection_error",
              status: 404,
            });
            handleNavigationError({
              error: true,
              type: "connection_error",
              status: 404,
              message: `Cannot access ${targetUrlForError}. The website might be blocking access or requires authentication.`,
              details: "The page could not be loaded in the iframe. This could be due to security restrictions or network issues.",
            }, targetUrlForError);
          } catch (error) {
            const errorMsg = `Cannot access the requested website. ${error instanceof Error ? error.message : String(error)}`;
            track(IE_ANALYTICS.NAVIGATION_ERROR, {
              url: finalUrl || url,
              type: "generic_error",
              error: errorMsg,
            });
            loadError(errorMsg, { 
              error: true, 
              type: "generic_error", 
              message: errorMsg 
            }); 
          }
        }
      }, 50);
    }
  };

  const handleNavigate = useCallback(async (
    targetUrlParam: string = url,
    targetYearParam: string = year,
    forceRegenerate = false,
    currentHtmlContent: string | null = null
  ) => {
    clearErrorDetails();

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (isAiLoading) {
      stopGeneration();
    }
    if (iframeRef.current && status === 'loading') {
      iframeRef.current.src = 'about:blank';
    }

    const newMode = targetYearParam === "current"
      ? "now"
      : parseInt(targetYearParam) > new Date().getFullYear()
        ? "future"
        : "past";
    const newToken = Date.now();

    // Store the latest token immediately so that asynchronous iframe load/error
    // handlers fired before the next React render can still validate correctly.
    navTokenRef.current = newToken;

    track(IE_ANALYTICS.NAVIGATION_START, {
      url: targetUrlParam,
      year: targetYearParam,
      mode: newMode,
    });

    navigateStart(targetUrlParam, targetYearParam, newMode, newToken);

    const normalizedTargetUrl = targetUrlParam.startsWith("http")
      ? targetUrlParam
      : `https://${targetUrlParam}`;

    try {
      if (newMode === "future" || (newMode === "past" && parseInt(targetYearParam) <= 1995)) {
        const cachedEntry = getCachedAiPage(normalizedTargetUrl, targetYearParam);
        if (cachedEntry && !forceRegenerate) {
          console.log(`[IE] Using LOCAL cached AI page for ${normalizedTargetUrl} in ${targetYearParam}`);
          const favicon = `https://www.google.com/s2/favicons?domain=${new URL(normalizedTargetUrl).hostname}&sz=32`;
          loadSuccess({
            aiGeneratedHtml: cachedEntry.html,
            title: cachedEntry.title || normalizedTargetUrl,
            targetUrl: normalizedTargetUrl,
            targetYear: targetYearParam,
            favicon: favicon,
            addToHistory: true
          });
          return;
        }
        
        let remoteCacheHit = false;
        if (!forceRegenerate) {
          try {
            console.log(`[IE] Checking REMOTE cache for ${normalizedTargetUrl} in ${targetYearParam}...`);
            const res = await fetch(`/api/iframe-check?mode=ai&url=${encodeURIComponent(normalizedTargetUrl)}&year=${targetYearParam}`);
            console.log(`[IE] Remote cache response status: ${res.status}, ok: ${res.ok}, content-type: ${res.headers.get("content-type")}`);

            if (res.ok && (res.headers.get("content-type")||"").includes("text/html")) {
              remoteCacheHit = true;
              const html = await res.text();
              console.log(`[IE] REMOTE cache HIT. Processing content (length: ${html.length})`);
              const titleMatch = html.match(/^<!--\s*TITLE:\s*(.*?)\s*-->/);
              const parsedTitle = titleMatch ? titleMatch[1].trim() : null;
              const cleanHtml = html.replace(/^<!--\s*TITLE:.*?-->\s*\n?/, "");
              
              try {
                cacheAiPage(normalizedTargetUrl, targetYearParam, cleanHtml, parsedTitle || normalizedTargetUrl);
                // Refresh cached years to update the count
                fetchCachedYears(normalizedTargetUrl);
              } catch (cacheError) {
                if (cacheError instanceof DOMException && cacheError.name === 'QuotaExceededError') {
                  console.warn(`[IE] LocalStorage quota exceeded. Failed to save remote cache locally for ${normalizedTargetUrl} (${targetYearParam}).`);
                } else {
                  console.error('[IE] Error saving remote cache to local store:', cacheError);
                }
              }

              const favicon = `https://www.google.com/s2/favicons?domain=${new URL(normalizedTargetUrl).hostname}&sz=32`;
              loadSuccess({ aiGeneratedHtml: cleanHtml, title: parsedTitle || normalizedTargetUrl, targetUrl: normalizedTargetUrl, targetYear: targetYearParam, favicon, addToHistory: true });
              console.log("[IE] Returning early after remote cache hit.");
              return;
            } else {
              console.log(`[IE] REMOTE cache MISS or invalid response.`);
            }
          } catch(e){ console.warn('[IE] AI remote cache fetch failed',e); }
        }

        if (remoteCacheHit) {
           console.error("[IE] Logic error: Should have returned on remote cache hit, but didn't!");
           return;
        }
        
        console.log(`[IE] No cache hit (Local: ${!!cachedEntry}, Remote: ${remoteCacheHit}, Force: ${forceRegenerate}). Proceeding to generate...`);
        if (playElevatorMusic && terminalSoundsEnabled) {
          playElevatorMusic(newMode);
        }
        
        try {
          await generateFuturisticWebsite(
            normalizedTargetUrl,
            targetYearParam,
            forceRegenerate,
            abortController.signal,
            null,
            currentHtmlContent
          );
          if (abortController.signal.aborted) return;
        } catch (error) {
          if (abortController.signal.aborted) return;
          console.error("[IE] AI generation error:", error);
          handleNavigationError({
            error: true,
            type: "ai_generation_error",
            message: "Failed to generate futuristic website. AI model may not be selected.",
            details: error instanceof Error ? error.message : String(error)
          }, normalizedTargetUrl);
          return;
        }

      } else {
        let urlToLoad = normalizedTargetUrl;

        if (newMode === "past") {
          try {
            const waybackUrl = await getWaybackUrl(normalizedTargetUrl, targetYearParam);
            if (abortController.signal.aborted) return;
            if (waybackUrl) {
              urlToLoad = waybackUrl;
            } else {
              await generateFuturisticWebsite(
                normalizedTargetUrl, 
                targetYearParam, 
                forceRegenerate, 
                abortController.signal, 
                null,
                currentHtmlContent
              );
              if (abortController.signal.aborted) return;
              return;
            }
          } catch (waybackError) {
            if (abortController.signal.aborted) return;
            console.warn(`[IE] Wayback Machine error for ${normalizedTargetUrl}:`, waybackError);
            await generateFuturisticWebsite(
              normalizedTargetUrl, 
              targetYearParam, 
              forceRegenerate, 
              abortController.signal, 
              null,
              currentHtmlContent
            );
            if (abortController.signal.aborted) return;
            return;
          }
        } else if (newMode === "now") {
          try {
            const checkRes = await fetch(
              `/api/iframe-check?mode=check&url=${encodeURIComponent(normalizedTargetUrl)}`,
              { signal: abortController.signal }
            );
            if (abortController.signal.aborted) return;

            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.allowed) {
                urlToLoad = normalizedTargetUrl;
                if (checkData.title) {
                  setPrefetchedTitle(checkData.title);
                }
              } else {
                urlToLoad = `/api/iframe-check?url=${encodeURIComponent(normalizedTargetUrl)}`;
              }
            } else {
              console.warn(`[IE] iframe-check failed (${checkRes.status}), attempting direct.`);
              urlToLoad = normalizedTargetUrl;
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
            console.warn(`[IE] iframe-check fetch failed, attempting direct:`, error);
            urlToLoad = normalizedTargetUrl;
          }
        }
        
        if (urlToLoad === finalUrl) {
          urlToLoad = `${urlToLoad}${urlToLoad.includes("?") ? "&" : "?"}_t=${Date.now()}`;
        }

        setFinalUrl(urlToLoad);

        if (iframeRef.current) {
          iframeRef.current.dataset.navToken = newToken.toString();
          iframeRef.current.src = urlToLoad;
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        console.error(`[IE] Navigation error:`, error);
        handleNavigationError({
          error: true,
          type: "navigation_error",
          message: `Failed to navigate: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : undefined
        }, normalizedTargetUrl);
      }
    }
  }, [url, year, finalUrl, status, token, isAiLoading, isNavigatingHistory, currentPageTitle, aiGeneratedHtml,
      navigateStart, setFinalUrl, loadError, generateFuturisticWebsite, stopGeneration, loadSuccess, getCachedAiPage,
      clearErrorDetails, handleNavigationError, setPrefetchedTitle, setYear, setUrl, fetchCachedYears]);

  const handleNavigateWithHistory = useCallback(async (
    targetUrl: string,
    targetYear?: string
  ) => {
    setNavigatingHistory(false);
    handleNavigate(targetUrl, targetYear || year, false);
  }, [handleNavigate, setNavigatingHistory, year]);

  const handleGoBack = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setNavigatingHistory(true);
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const entry = history[nextIndex];
      handleNavigate(entry.url, entry.year || "current", false);
    }
  }, [history, historyIndex, setHistoryIndex, handleNavigate, setNavigatingHistory]);

  const handleGoForward = useCallback(() => {
    if (historyIndex > 0) {
      setNavigatingHistory(true);
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      const entry = history[nextIndex];
      handleNavigate(entry.url, entry.year || "current", false);
    }
  }, [history, historyIndex, setHistoryIndex, handleNavigate, setNavigatingHistory]);

  const handleAddFavorite = useCallback(() => {
    const titleSource = currentPageTitle || (finalUrl ? new URL(finalUrl).hostname : (url ? new URL(url.startsWith("http") ? url : `https://${url}`).hostname : "Page"));
    setNewFavoriteTitle(titleSource);
    setTitleDialogOpen(true);
  }, [currentPageTitle, finalUrl, url, setNewFavoriteTitle, setTitleDialogOpen]);

  const handleTitleSubmit = useCallback(() => {
    if (!newFavoriteTitle) return;
    const favUrl = url;
    const favHostname = finalUrl ? new URL(finalUrl).hostname : (favUrl ? new URL(favUrl.startsWith("http") ? favUrl : `https://${favUrl}`).hostname : "unknown.com");
    const favIcon = `https://www.google.com/s2/favicons?domain=${favHostname}&sz=32`;
    addFavorite({
      title: newFavoriteTitle,
      url: favUrl,
      favicon: favIcon,
      year: year !== "current" ? year : undefined,
    });
    setTitleDialogOpen(false);
  }, [newFavoriteTitle, addFavorite, finalUrl, url, year, setTitleDialogOpen]);

  const handleResetFavorites = useCallback(() => {
    clearFavorites();
    DEFAULT_FAVORITES.forEach(fav => addFavorite(fav));
    setResetFavoritesDialogOpen(false);
  }, [clearFavorites, addFavorite, setResetFavoritesDialogOpen]);

  const handleClearFavorites = useCallback(() => {
    clearFavorites();
    setClearFavoritesDialogOpen(false);
  }, [clearFavorites, setClearFavoritesDialogOpen]);

  const handleRefresh = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (iframeRef.current) iframeRef.current.src = 'about:blank';
    handleNavigate(url, year, true);
  }, [handleNavigate, url, year]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    cancel();
    if (isAiLoading) {
      stopGeneration();
    }
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
    }
    clearErrorDetails();
    
    if (stopElevatorMusic) {
      stopElevatorMusic();
    }
  }, [cancel, isAiLoading, stopGeneration, clearErrorDetails, stopElevatorMusic]);

  const handleGoToUrl = useCallback(() => {
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  }, []);

  const handleHome = useCallback(() => {
    handleNavigate("apple.com", "2002");
  }, [handleNavigate]);

  // Use a ref to prevent duplicate initial navigations
  const initialNavigationRef = useRef(false);
  useEffect(() => {
    // Only run initial navigation logic once when the window opens
    if (!initialNavigationRef.current && isWindowOpen) {
      initialNavigationRef.current = true;
      console.log("[IE] Running initial navigation check. Received initialData:", initialData);

      // Check if initialData contains a shareCode (passed via props on first open)
      if (initialData?.shareCode) {
        const code = initialData.shareCode;
        const decodedData = decodeData(code);

        if (decodedData) {
          console.log(`[IE] Decoded share link from initialData prop: ${decodedData.url} (${decodedData.year})`);
          toast.info(
            `Opening shared page`,
            {
              description: `${decodedData.url}${decodedData.year && decodedData.year !== 'current' ? ` from ${decodedData.year}` : ''}`,
              duration: 4000,
            }
          );
          // Navigate using decoded data
          setTimeout(() => {
             handleNavigate(decodedData.url, decodedData.year || 'current', false);
          }, 0);
          // AppManager should have already cleaned the URL
          return; // Skip default navigation
        } else {
          console.warn("[IE] Failed to decode share link code from initialData prop.");
          toast.error("Invalid Share Link", {
            description: "The share link provided is invalid or corrupted.",
            duration: 5000,
          });
           // Fall through to default navigation
        }
      }

      // Proceed with default navigation if not a share link or if decoding failed
      console.log("[IE] Proceeding with default navigation.");
      setTimeout(() => {
         handleNavigate(url, year, false);
      }, 0);
    }
  }, [initialData, isWindowOpen, handleNavigate, url, year]); // Dependencies remain

  // --- Add listener for updateApp event (handles share links when app is already open) ---
  useEffect(() => {
    const handleUpdateApp = (event: CustomEvent<{ appId: string; initialData?: any }>) => {
      if (event.detail.appId === 'internet-explorer' && event.detail.initialData?.shareCode) {
        const code = event.detail.initialData.shareCode;
        console.log("[IE] Received updateApp event with shareCode:", code);
        const decodedData = decodeData(code);

        if (decodedData) {
          console.log(`[IE] Decoded share link from updateApp event: ${decodedData.url} (${decodedData.year})`);
          // Bring the window to the foreground if it's not already
          if (!isForeground) {
            bringToForeground('internet-explorer');
          }
          // Show toast and navigate
          toast.info(
            `Opening shared page`,
            {
              description: `${decodedData.url}${decodedData.year && decodedData.year !== 'current' ? ` from ${decodedData.year}` : ''}`,
              duration: 4000,
            }
          );
          // Use timeout to allow potential state updates (like foreground) to settle
          setTimeout(() => {
            handleNavigate(decodedData.url, decodedData.year || 'current', false);
          }, 50); // Small delay
        } else {
          console.warn("[IE] Failed to decode share link code from updateApp event.");
          toast.error("Invalid Share Link", {
            description: "The share link provided is invalid or corrupted.",
            duration: 5000,
          });
        }
      }
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => {
      window.removeEventListener("updateApp", handleUpdateApp as EventListener);
    };
  // Add bringToForeground and isForeground to dependencies
  }, [handleNavigate, bringToForeground, isForeground]);
  // --- End updateApp listener ---

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data &&
        event.data.type === "iframeNavigation" &&
        typeof event.data.url === "string"
      ) {
        console.log(`[IE] Received navigation request from iframe: ${event.data.url}`);
        handleNavigate(event.data.url, year);
      } else if (event.data && event.data.type === "goBack") {
        console.log(`[IE] Received back button request from iframe`);
        handleGoBack();
      } else if (
        event.data &&
        event.data.type === "aiHtmlNavigation" &&
        typeof event.data.url === "string"
      ) {
        console.log(`[IE] Received navigation request from AI HTML preview: ${event.data.url}`);
        // Fetch the most up-to-date HTML from the store in case the closure is stale
        const latestAiHtml = useInternetExplorerStore.getState().aiGeneratedHtml;
        const contextHtml = generatedHtml || latestAiHtml;
        
        handleNavigate(event.data.url, year, false, contextHtml);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [year, handleNavigate, handleGoBack]);

  useEffect(() => {
    if (!isWindowOpen) {
      if (stopElevatorMusic) {
        stopElevatorMusic();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (iframeRef.current) {
        iframeRef.current.src = 'about:blank';
      }
    }
  }, [isWindowOpen, stopElevatorMusic]);

  useEffect(() => {
    const container = favoritesContainerRef.current;

    const handleWheel = (e: WheelEvent) => {
      if (!container) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      } 
    };

    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAiLoading && !isFetchingWebsiteContent && status !== "loading") {
      if (stopElevatorMusic) {
        stopElevatorMusic();
      }
    }
  }, [isAiLoading, isFetchingWebsiteContent, status, stopElevatorMusic]);

  const getDebugStatusMessage = () => {
    if (!(status === "loading" || isAiLoading || isFetchingWebsiteContent)) return null;

    const hostname = url ? getHostnameFromUrl(url) : "unknown";
    const aiModel = useAppStore.getState().aiModel;
    const modelInfo = aiModel ? `${aiModel} ` : '';
    
    // Get language and location display names
    const languageDisplayName = language !== "auto" ? getLanguageDisplayName(language) : "";
    const locationDisplayName = location !== "auto" ? getLocationDisplayName(location) : "";
    
    if (isFetchingWebsiteContent) {
      return (
        <div className="flex items-center gap-1">
          {debugMode && <span className="text-gray-500">Fetch</span>}
          <span>{`Fetching content of ${hostname} for reconstruction...`}</span>
        </div>
      );
    }
    
    switch (mode) {
      case "future":
        return (
          <div className="flex items-center gap-1">
            {debugMode && (
              <span className="text-gray-500">
                {modelInfo}
                {language !== "auto" && ` ${languageDisplayName}`}
                {location !== "auto" && ` ${locationDisplayName}`}
              </span>
            )}
            <span>{`Reimagining ${hostname} for year ${year}...`}</span>
          </div>
        );
      case "past":
        if (parseInt(year) <= 1995) {
          return (
            <div className="flex items-center gap-1">
              {debugMode && (
                <span className="text-gray-500">
                  {modelInfo}
                  {language !== "auto" && ` ${languageDisplayName}`}
                  {location !== "auto" && ` ${locationDisplayName}`}
                </span>
              )}
              <span>{`Reconstructing history of ${hostname} for year ${year}...`}</span>
            </div>
          );
        }
        return `Fetching ${hostname} from year ${year}...`;
      case "now":
        return `Loading ${hostname}...`;
      default:
        return `Loading ${hostname}...`;
    }
  };

  // --- Add custom sorting logic for TimeMachineView --- 
  const chronologicallySortedYears = useMemo(() => {
    const parseYear = (yearStr: string): number => {
      if (yearStr === 'current') return new Date().getFullYear() + 0.5; // Place 'current' slightly after the current year number
      if (yearStr.endsWith(' BC')) {
        return -parseInt(yearStr.replace(' BC', ''), 10);
      } 
      if (yearStr.endsWith(' CE')) {
        return parseInt(yearStr.replace(' CE', ''), 10);
      }
      const yearNum = parseInt(yearStr, 10);
      return isNaN(yearNum) ? Infinity : yearNum; // Handle potential non-numeric strings
    };

    return [...cachedYears].sort((a, b) => parseYear(a) - parseYear(b));
  }, [cachedYears]);
  // --- End custom sorting logic ---

  const handleSharePage = useCallback(() => {
    setIsShareDialogOpen(true);
  }, []);

  if (!isWindowOpen) return null;

  const isLoading = status === "loading" || isAiLoading || isFetchingWebsiteContent;
  const isFutureYear = mode === "future";

  const loadingBarVariants = {
    hidden: { 
      height: 0,
      opacity: 0,
      transition: { duration: 0.3 }
    },
    visible: { 
      height: "0.25rem",
      opacity: 1,
      transition: { duration: 0.3 }
    },
  };

  const renderErrorPage = () => {
    if (!errorDetails) return null;

    const errorHostname = errorDetails.hostname || "the website";

    const commonSuggestions: ReactNode[] = [
      "Try time traveling to a different year",
      <>Go <a href="#" role="button" onClick={(e) => { e.preventDefault(); handleGoBack(); }} className="text-red-600 underline">Back</a> or change the URL to visit a different website</>,
    ];
    
    const refreshSuggestion: ReactNode = 
        <>Click the <a href="#" role="button" onClick={(e) => { e.preventDefault(); handleRefresh(); }} className="text-red-600 underline">Refresh</a> link to try again</>;

    switch (errorDetails.type) {
      case "http_error":
        return (
          <ErrorPage
            title="The page cannot be displayed"
            primaryMessage="The page you are looking for might have been removed, had its name changed, or is temporarily unavailable."
            suggestions={[
              "If you typed the page address in the Address bar, make sure that it is spelled correctly.",
              <>Open <a href={`https://${errorHostname}`} target="_blank" rel="noopener noreferrer" className="text-red-600 underline">{errorHostname}</a> in a new tab, and then look for links to the information you want.</>,
              <>Go <a href="#" role="button" onClick={(e) => { e.preventDefault(); handleGoBack(); }} className="text-red-600 underline">Back</a> or change the URL to try another page.</>,
            ]}
            details={errorHostname}
            footerText={`HTTP ${errorDetails.status || 404} - ${errorDetails.statusText || "Not Found"}\nInternet Explorer`}
            onGoBack={handleGoBack}
            onRetry={handleRefresh}
          />
        );
      case "connection_error":
        return (
          <ErrorPage
            title="The page cannot be displayed"
            primaryMessage={errorDetails.message || "Internet Explorer cannot access this website."}
            suggestions={[
              refreshSuggestion,
              ...commonSuggestions
            ]}
            details={errorDetails.details || "Connection failed"}
            footerText={`Connection Error\nInternet Explorer`}
            onGoBack={handleGoBack}
            onRetry={handleRefresh}
          />
        );
      case "ai_generation_error":
         return (
          <ErrorPage
            title="The page cannot be imagined"
            primaryMessage={errorDetails.message}
            suggestions={[
              refreshSuggestion,
              ...commonSuggestions
            ]}
            details={errorDetails.details}
            footerText={`Time Machine Error\nInternet Explorer`}
            onGoBack={handleGoBack}
            onRetry={handleRefresh}
          />
        );
      default:
        return (
          <ErrorPage
            title="An error occurred"
            primaryMessage={errorDetails.message}
            suggestions={[
               refreshSuggestion,
              ...commonSuggestions
            ]}
            details={errorDetails.details}
            footerText={`Error\nInternet Explorer`}
            onGoBack={handleGoBack}
            onRetry={handleRefresh}
          />
        );
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <InternetExplorerMenuBar
        isWindowOpen={isWindowOpen}
        isForeground={isForeground}
        onRefresh={handleRefresh}
        onStop={handleStop}
        onFocusUrlInput={handleGoToUrl}
        onHome={handleHome}
        onShowHelp={() => setHelpDialogOpen(true)}
        onShowAbout={() => setAboutDialogOpen(true)}
        isLoading={isLoading}
        favorites={favorites}
        history={history}
        onAddFavorite={handleAddFavorite}
        onClearFavorites={() => setClearFavoritesDialogOpen(true)}
        onResetFavorites={() => setResetFavoritesDialogOpen(true)}
        onNavigateToFavorite={(favUrl, favYear) => handleNavigateWithHistory(favUrl, favYear)}
        onNavigateToHistory={handleNavigateWithHistory}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        canGoBack={historyIndex < history.length - 1}
        canGoForward={historyIndex > 0}
        onClearHistory={() => setClearHistoryDialogOpen(true)}
        onOpenTimeMachine={() => setTimeMachineViewOpen(true)}
        onClose={onClose}
        onEditFuture={() => setFutureSettingsDialogOpen(true)}
        language={language}
        location={location}
        year={year}
        onLanguageChange={setLanguage}
        onLocationChange={setLocation}
        onYearChange={(newYear) => handleNavigate(url, newYear)}
        onSharePage={handleSharePage}
      />
      <WindowFrame
        title={displayTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="internet-explorer"
        skipInitialSound={skipInitialSound}
      >
        <div className="flex flex-col h-full w-full relative">
          <div className="flex flex-col gap-1 p-1 bg-gray-100 border-b border-black">
            <div className="flex gap-2 items-center">
              <div className="flex gap-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleGoBack}
                  disabled={historyIndex >= history.length - 1}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleGoForward}
                  disabled={historyIndex <= 0}
                  className="h-8 w-8"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSharePage}
                      className="h-8 w-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                      aria-label="Share this page"
                    >
                      <Share className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Share this page</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex-1 relative flex items-center">
              <Input
                ref={urlInputRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleNavigate();
                  }
                }}
                  className="flex-1 pr-8"
                placeholder="Enter URL"
              />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTimeMachineViewOpen(true)}
                      disabled={isFetchingCachedYears || cachedYears.length <= 1}
                      className={`h-7 w-7 absolute right-1 top-1/2 -translate-y-1/2 focus-visible:ring-0 focus-visible:ring-offset-0 ${cachedYears.length > 1 ? '' : 'opacity-50 cursor-not-allowed'}`}
                      aria-label="Show cached versions (Time Machine)"
                      style={{ pointerEvents: cachedYears.length <= 1 ? 'none' : 'auto' }}
                    >
                      <History className={`h-4 w-4 ${cachedYears.length > 1 ? 'text-orange-500' : 'text-neutral-400'}`} />
                    </Button>
                  </TooltipTrigger>
                  {cachedYears.length > 1 && (
                    <TooltipContent side="bottom">
                      <p>{cachedYears.length} Time Node{cachedYears.length !== 1 ? 's' : ''}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={year}
                  onValueChange={(newYear) => handleNavigate(url, newYear)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {futureYears.map((y) => (
                      <SelectItem key={y} value={y} className="text-blue-600">{y}</SelectItem>
                    ))}
                    <SelectItem value="current">Now</SelectItem>
                    {pastYears.map((y) => (
                      <SelectItem key={y} value={y} className={parseInt(y) <= 1995 ? "text-blue-600" : ""}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="relative flex items-center">
              <div
                ref={favoritesContainerRef}
                className="overflow-x-auto scrollbar-none relative flex-1"
              >
                <div className="flex items-center min-w-full w-max">
                  {favorites.map((favorite, index) => (
                    <Button
                      key={index}
                      variant="ghost"
                      size="sm"
                      className="whitespace-nowrap hover:bg-gray-200 font-geneva-12 text-[10px] gap-1 px-1 mr-1 w-content min-w-[60px] max-w-[120px] flex-shrink-0"
                      onClick={(e) => {
                        handleNavigateWithHistory(favorite.url, favorite.year);
                        e.currentTarget.scrollIntoView({ 
                          behavior: 'smooth', 
                          block: 'nearest', 
                          inline: 'nearest' 
                        });
                      }}
                    >
                      <img
                        src={favorite.favicon || "/icons/ie-site.png"}
                        alt="Site"
                        className="w-4 h-4 mr-1"
                        onError={(e) => { e.currentTarget.src = "/icons/ie-site.png"; }}
                      />
                      <span className="truncate">{favorite.title}</span>
                    </Button>
                  ))}
                </div>
              </div>
              {favorites.length > 0 && hasMoreToScroll && (
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none" />
              )}
            </div>
          </div>

          <div className="flex-1 relative">
            {errorDetails ? (
              renderErrorPage()
            ) : isFutureYear || (mode === "past" && (isAiLoading || aiGeneratedHtml)) ? (
              <div className="w-full h-full overflow-hidden absolute inset-0 font-geneva-12">
                <HtmlPreview
                  htmlContent={isAiLoading ? generatedHtml || "" : aiGeneratedHtml || ""}
                  onInteractionChange={() => {}}
                  className="border-none"
                  maxHeight="none"
                  minHeight="100%"
                  initialFullScreen={false}
                  isInternetExplorer={true}
                  isStreaming={isAiLoading && generatedHtml !== aiGeneratedHtml}
                  playElevatorMusic={playElevatorMusic}
                  stopElevatorMusic={stopElevatorMusic}
                  playDingSound={playDingSound}
                  baseUrlForAiContent={url}
                  mode={mode}
                />
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                src={finalUrl || ""}
                className="w-full h-full border-0"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            )}

            {!isForeground && (
              <div 
                className="absolute inset-0 bg-transparent z-50"
                onClick={() => bringToForeground("internet-explorer")}
                onMouseDown={() => bringToForeground("internet-explorer")}
                onTouchStart={() => bringToForeground("internet-explorer")}
                onWheel={() => bringToForeground("internet-explorer")}
                onDragStart={() => bringToForeground("internet-explorer")}
                onKeyDown={() => bringToForeground("internet-explorer")}
              />
            )}

            <AnimatePresence>
              {(status === "loading" || isAiLoading || isFetchingWebsiteContent) && (
                <motion.div
                  className="absolute top-0 left-0 right-0 bg-white/75 backdrop-blur-sm overflow-hidden z-50"
                  variants={loadingBarVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                >
                  <div className={`h-full ${
                    isAiLoading && mode === "past" && parseInt(year) <= 1995 ? 'animate-progress-indeterminate-orange-reverse' :
                    isAiLoading ? 'animate-progress-indeterminate-orange' : 
                    isFetchingWebsiteContent && mode === "past" ? 'animate-progress-indeterminate-green-reverse' :
                    isFetchingWebsiteContent ? 'animate-progress-indeterminate-green' : 
                    mode === "past" && !isAiLoading ? 'animate-progress-indeterminate-reverse' : 
                    'animate-progress-indeterminate'
                  }`} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            { debugMode && (status === "loading" || (isAiLoading && generatedHtml !== aiGeneratedHtml) || isFetchingWebsiteContent) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-0 left-0 right-0 bg-gray-100 border-t border-black font-geneva-12 text-[10px] px-2 py-1 flex items-center z-50"
              >
                <div className="flex-1 truncate">
                  {getDebugStatusMessage()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <InputDialog
          isOpen={isTitleDialogOpen}
          onOpenChange={setTitleDialogOpen}
          onSubmit={handleTitleSubmit}
          title="Add Favorite"
          description="Enter a title for this favorite"
          value={newFavoriteTitle}
          onChange={setNewFavoriteTitle}
        />
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setHelpDialogOpen}
          helpItems={helpItems || []}
          appName="Internet Explorer"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isClearFavoritesDialogOpen}
          onOpenChange={setClearFavoritesDialogOpen}
          onConfirm={handleClearFavorites}
          title="Clear Favorites"
          description="Are you sure you want to clear all favorites?"
        />
        <ConfirmDialog
          isOpen={isClearHistoryDialogOpen}
          onOpenChange={setClearHistoryDialogOpen}
          onConfirm={() => {
            clearHistory();
            setClearHistoryDialogOpen(false);
          }}
          title="Clear History"
          description="Are you sure you want to clear all history?"
        />
        <ConfirmDialog
          isOpen={isResetFavoritesDialogOpen}
          onOpenChange={setResetFavoritesDialogOpen}
          onConfirm={handleResetFavorites}
          title="Reset Favorites"
          description="Are you sure you want to reset favorites to default?"
        />
        <FutureSettingsDialog
          isOpen={isFutureSettingsDialogOpen}
          onOpenChange={setFutureSettingsDialogOpen}
        />
        <TimeMachineView 
          isOpen={isTimeMachineViewOpen}
          onClose={() => setTimeMachineViewOpen(false)}
          cachedYears={chronologicallySortedYears}
          currentUrl={url}
          currentSelectedYear={year}
          onSelectYear={(selectedYear) => {
            handleNavigate(url, selectedYear);
          }}
        />
      </WindowFrame>

      <ShareLinkDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        url={url}
        year={year}
      />
    </TooltipProvider>
  );
}
