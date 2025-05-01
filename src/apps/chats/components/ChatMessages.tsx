import { Message as VercelMessage } from "ai";
import {
  Loader2,
  AlertCircle,
  MessageSquare,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import HtmlPreview, {
  isHtmlCodeBlock,
  extractHtmlContent,
} from "@/components/shared/HtmlPreview";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

// --- Helper functions moved/redefined here for cleaning ---
const cleanAppControlMarkup = (message: string): string => {
  // Remove app control tags entirely before rendering
  return message
    .replace(/<app:launch[^>]*\/>/g, "")
    .replace(/<app:close[^>]*\/>/g, "")
    .trim();
};

const cleanTextEditMarkup = (message: string): string => {
  // Remove textedit tags entirely before rendering
  return message
    .replace(/<textedit:insert[^>]*>.*?<\/textedit:insert>/gs, "")
    .replace(/<textedit:replace[^>]*>.*?<\/textedit:replace>/gs, "")
    .replace(/<textedit:delete[^>]*\/>/gs, "")
    .trim();
};
// --- End Helper Functions ---

// --- Color Hashing for Usernames ---
const userColors = [
  "bg-pink-100 text-black",
  "bg-purple-100 text-black",
  "bg-indigo-100 text-black",
  "bg-teal-100 text-black",
  "bg-lime-100 text-black",
  "bg-amber-100 text-black",
  "bg-cyan-100 text-black",
  "bg-rose-100 text-black",
];

const getUserColorClass = (username?: string): string => {
  if (!username) {
    return "bg-gray-100 text-black"; // Default or fallback color
  }
  // Simple hash function
  const hash = username
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return userColors[hash % userColors.length];
};
// --- End Color Hashing ---

// Helper function to parse markdown and segment text
const parseMarkdown = (text: string): { type: string; content: string }[] => {
  const tokens: { type: string; content: string }[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    // Check for bold text (**text**)
    const boldMatch = text.slice(currentIndex).match(/^\*\*(.*?)\*\*/);
    if (boldMatch) {
      tokens.push({ type: "bold", content: boldMatch[1] });
      currentIndex += boldMatch[0].length;
      continue;
    }

    // Check for italic text (*text*)
    const italicMatch = text.slice(currentIndex).match(/^\*(.*?)\*/);
    if (italicMatch) {
      tokens.push({ type: "italic", content: italicMatch[1] });
      currentIndex += italicMatch[0].length;
      continue;
    }

    // Match CJK characters, emojis, words, spaces, or other characters
    const wordMatch = text
      .slice(currentIndex)
      .match(
        /^([\p{Emoji_Presentation}\p{Extended_Pictographic}]|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[a-zA-Z0-9]+|[^\S\n]+|[^a-zA-Z0-9\s\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}*]+)/u
      );

    if (wordMatch) {
      tokens.push({ type: "text", content: wordMatch[0] });
      currentIndex += wordMatch[0].length;
      continue;
    }

    // If no match found (shouldn't happen), move forward one character
    tokens.push({ type: "text", content: text[currentIndex] });
    currentIndex++;
  }

  return tokens;
};

// Helper function to segment text properly for CJK and emojis
const segmentText = (text: string): { type: string; content: string }[] => {
  // First split by line breaks to preserve them
  return text.split(/(\n)/).flatMap((segment) => {
    if (segment === "\n") return [{ type: "text", content: "\n" }];
    // Parse markdown and maintain word boundaries in the segment
    return parseMarkdown(segment);
  });
};

// Helper function to check if text contains only emojis
const isEmojiOnly = (text: string): boolean => {
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
  return emojiRegex.test(text);
};

// Define an extended message type that includes username
// Extend VercelMessage and add username and the 'human' role
interface ChatMessage extends Omit<VercelMessage, "role"> {
  // Omit the original role to redefine it
  username?: string; // Add username, make it optional for safety
  role: VercelMessage["role"] | "human"; // Allow original roles plus 'human'
  isPending?: boolean; // Add isPending flag
}

interface ChatMessagesProps {
  messages: ChatMessage[]; // Use the extended type
  isLoading: boolean;
  error?: Error;
  onRetry?: () => void;
  onClear?: () => void;
  isRoomView: boolean; // Add prop to indicate if this is a room view
  isInitialLoad?: boolean; // Add new prop to track initial load or channel switch
}

// Component to render the scroll-to-bottom button using the library's context
function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    <AnimatePresence>
      {!isAtBottom && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ type: "spring", duration: 0.2 }}
          className="absolute bottom-3 right-3 bg-black/70 hover:bg-black text-white p-1.5 rounded-full shadow-md z-20"
          onClick={() => scrollToBottom()} // Use the library's function
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function ChatMessages({
  messages,
  isLoading,
  error,
  onRetry,
  onClear,
  isRoomView,
  isInitialLoad = false, // Default to false for existing behavior
}: ChatMessagesProps) {
  const { playNote } = useChatSynth();
  const { playElevatorMusic, stopElevatorMusic, playDingSound } =
    useTerminalSounds();
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [isInteractingWithPreview, setIsInteractingWithPreview] =
    useState(false);

  // Refs needed for message processing/animation, but not scrolling
  const previousMessagesRef = useRef<ChatMessage[]>([]);
  const initialMessageIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);

  // --- New Effect for Sound/Vibration ---
  useEffect(() => {
    if (
      previousMessagesRef.current.length > 0 &&
      messages.length > previousMessagesRef.current.length
    ) {
      const previousIds = new Set(
        previousMessagesRef.current.map(
          (m) => m.id || `${m.role}-${m.content.substring(0, 10)}`
        )
      );
      const newMessages = messages.filter(
        (currentMsg) =>
          !previousIds.has(
            currentMsg.id ||
              `${currentMsg.role}-${currentMsg.content.substring(0, 10)}`
          )
      );
      const newHumanMessage = newMessages.find((msg) => msg.role === "human");
      if (newHumanMessage) {
        playNote();
        if ("vibrate" in navigator) {
          navigator.vibrate(100);
        }
      }
    }
    previousMessagesRef.current = messages;
  }, [messages, playNote]);
  // --- End New Effect ---

  // Effect to capture initial message IDs (runs once per component instance/key change)
  useEffect(() => {
    // Only initialize once per component instance (keyed mount)
    if (!hasInitializedRef.current && messages.length > 0) {
      hasInitializedRef.current = true;
      previousMessagesRef.current = messages; // Initialize previous messages
      initialMessageIdsRef.current = new Set(
        messages.map((m) => m.id || `${m.role}-${m.content.substring(0, 10)}`)
      );
    } else if (messages.length === 0) {
      // Also reset if starting empty
      hasInitializedRef.current = false; // Allow re-initialization if messages appear later
    }
  }, [messages]); // Re-run if messages array itself changes (e.g., clearing chat)

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(
        message.id || `${message.role}-${message.content.substring(0, 10)}`
      );
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
      try {
        const textarea = document.createElement("textarea");
        textarea.value = message.content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedMessageId(
          message.id || `${message.role}-${message.content.substring(0, 10)}`
        );
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
      }
    }
  };

  const isUrgentMessage = (content: string) => content.startsWith("!!!!");

  return (
    // Use StickToBottom component as the main container
    <StickToBottom
      className="flex-1 relative flex flex-col overflow-hidden bg-white border-2 border-gray-800 rounded mb-2 w-full"
      // Use instant behavior for initial load/channel switch, smooth otherwise
      resize={isInitialLoad ? "instant" : "smooth"}
      initial={isInitialLoad ? "instant" : "smooth"}
    >
      {/* StickToBottom.Content wraps the actual scrollable content */}
      <StickToBottom.Content className="flex flex-col gap-1 p-2">
        <AnimatePresence initial={false} mode="sync">
          {/* Keep the motion.div for layout animations if needed, but it's inside StickToBottom.Content now */}
          {/* The className might need adjustment as StickToBottom.Content handles flex/gap */}
          {messages.length === 0 && !isRoomView && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
            >
              <MessageSquare className="h-3 w-3" />
              <span>Start a new conversation?</span>
              {onClear && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={onClear}
                  className="m-0 p-0 text-[16px] h-0 text-gray-500 hover:text-gray-700"
                >
                  New chat
                </Button>
              )}
            </motion.div>
          )}
          {messages.map((message) => {
            const messageKey =
              message.id ||
              `${message.role}-${message.content.substring(0, 10)}`;
            const isInitialMessage =
              initialMessageIdsRef.current.has(messageKey);

            const variants = {
              initial: { opacity: 0 },
              animate: { opacity: 1 },
            };
            let bgColorClass = "";
            if (message.role === "user")
              bgColorClass = "bg-yellow-100 text-black";
            else if (message.role === "assistant")
              bgColorClass = "bg-blue-100 text-black";
            else if (message.role === "human")
              bgColorClass = getUserColorClass(message.username);

            return (
              <motion.div
                layout="position"
                key={messageKey}
                variants={variants}
                initial={isInitialMessage ? "animate" : "initial"}
                animate="animate"
                transition={{ type: "spring", duration: 0.4 }}
                className={`flex flex-col z-10 w-full ${
                  message.role === "user" ? "items-end" : "items-start"
                }`}
                style={{
                  transformOrigin:
                    message.role === "user" ? "bottom right" : "bottom left",
                }}
                onMouseEnter={() =>
                  !isInteractingWithPreview && setHoveredMessageId(messageKey)
                }
                onMouseLeave={() =>
                  !isInteractingWithPreview && setHoveredMessageId(null)
                }
              >
                <motion.div
                  layout="position"
                  className="text-[16px] text-gray-500 mb-0.5 font-['Geneva-9'] mb-[-2px] select-text flex items-center gap-2"
                >
                  {message.role === "user" && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{
                        opacity: hoveredMessageId === messageKey ? 1 : 0,
                        scale: 1,
                      }}
                      className="h-3 w-3 text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={() => copyMessage(message)}
                    >
                      {copiedMessageId === messageKey ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </motion.button>
                  )}
                  {message.username ||
                    (message.role === "user" ? "You" : "Ryo")}{" "}
                  <span className="text-gray-400 select-text">
                    {message.createdAt ? (
                      (() => {
                        const messageDate = new Date(message.createdAt);
                        const today = new Date();
                        const isBeforeToday =
                          messageDate.getDate() !== today.getDate() ||
                          messageDate.getMonth() !== today.getMonth() ||
                          messageDate.getFullYear() !== today.getFullYear();

                        return isBeforeToday
                          ? messageDate.toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })
                          : messageDate.toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            });
                      })()
                    ) : (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                  </span>
                  {message.role === "assistant" && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{
                        opacity: hoveredMessageId === messageKey ? 1 : 0,
                        scale: 1,
                      }}
                      className="h-3 w-3 text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={() => copyMessage(message)}
                    >
                      {copiedMessageId === messageKey ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </motion.button>
                  )}
                </motion.div>

                {/* Assistant Message Rendering Logic */}
                {message.role === "assistant" ? (
                  (() => {
                    // --- START: Clean content & Determine Rendering ---
                    let processedContent = message.content;
                    if (isUrgentMessage(processedContent)) {
                      processedContent = processedContent.slice(4).trimStart();
                    }
                    processedContent = cleanAppControlMarkup(processedContent);
                    processedContent = cleanTextEditMarkup(processedContent);

                    // Check for incomplete edits using ORIGINAL content
                    const hasIncompleteXmlTags =
                      /<textedit:(insert|replace|delete)/i.test(
                        message.content
                      ) &&
                      (() => {
                        const openTags = (
                          message.content.match(
                            /<textedit:(insert|replace|delete)/g
                          ) || []
                        ).length;
                        const closeTags = (
                          message.content.match(
                            /<\/textedit:(insert|replace)>|<textedit:delete[^>]*\/>/g
                          ) || []
                        ).length;
                        return openTags !== closeTags;
                      })();

                    // Determine if HTML preview is needed based on CLEANED content
                    const {
                      hasHtml: shouldRenderHtmlPreview,
                      htmlContent,
                      textContent,
                    } = extractHtmlContent(processedContent);
                    // --- END: Clean content & Determine Rendering ---

                    // Determine bubble class based on whether HtmlPreview will render
                    const bubbleClassName = shouldRenderHtmlPreview
                      ? "w-full p-[1px] m-0 outline-0 ring-0 !bg-transparent" // Style for HTML Preview
                      : `w-fit max-w-[90%] p-1.5 px-2 ${
                          bgColorClass || "bg-blue-100 text-black"
                        } min-h-[12px] rounded leading-snug text-[12px] font-geneva-12 break-words select-text`; // Normal bubble style

                    return (
                      <motion.div
                        layout="position"
                        initial={{
                          // Use bgColorClass if available, otherwise default to assistant blue
                          backgroundColor: bgColorClass
                            .split(" ")[0]
                            .includes("pink")
                            ? "#fce7f3"
                            : bgColorClass.split(" ")[0].includes("purple")
                            ? "#f3e8ff"
                            : bgColorClass.split(" ")[0].includes("indigo")
                            ? "#e0e7ff"
                            : bgColorClass.split(" ")[0].includes("teal")
                            ? "#ccfbf1"
                            : bgColorClass.split(" ")[0].includes("lime")
                            ? "#ecfccb"
                            : bgColorClass.split(" ")[0].includes("amber")
                            ? "#fef3c7"
                            : bgColorClass.split(" ")[0].includes("cyan")
                            ? "#cffafe"
                            : bgColorClass.split(" ")[0].includes("rose")
                            ? "#ffe4e6"
                            : "#dbeafe", // Default assistant blue
                          color: "#000000",
                        }}
                        animate={
                          isUrgentMessage(message.content)
                            ? {
                                backgroundColor: [
                                  "#fee2e2", // Start with red for urgent (lighter red-100)
                                  // Determine the final background color based on bgColorClass or default blue
                                  bgColorClass.split(" ")[0].includes("pink")
                                    ? "#fce7f3"
                                    : bgColorClass
                                        .split(" ")[0]
                                        .includes("purple")
                                    ? "#f3e8ff"
                                    : bgColorClass
                                        .split(" ")[0]
                                        .includes("indigo")
                                    ? "#e0e7ff"
                                    : bgColorClass
                                        .split(" ")[0]
                                        .includes("teal")
                                    ? "#ccfbf1"
                                    : bgColorClass
                                        .split(" ")[0]
                                        .includes("lime")
                                    ? "#ecfccb"
                                    : bgColorClass
                                        .split(" ")[0]
                                        .includes("amber")
                                    ? "#fef3c7"
                                    : bgColorClass
                                        .split(" ")[0]
                                        .includes("cyan")
                                    ? "#cffafe"
                                    : bgColorClass
                                        .split(" ")[0]
                                        .includes("rose")
                                    ? "#ffe4e6"
                                    : "#dbeafe", // Default assistant blue (removed redundant role check)
                                ],
                                color: ["#C92D2D", "#000000"],
                                transition: {
                                  duration: 1,
                                  repeat: 1,
                                  repeatType: "reverse",
                                  ease: "easeInOut",
                                  delay: 0,
                                },
                              }
                            : {}
                        }
                        className={bubbleClassName} // Apply the determined class name
                      >
                        <motion.div className="select-text whitespace-pre-wrap">
                          {hasIncompleteXmlTags ? (
                            <motion.span
                              initial={{ opacity: 1 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0 }}
                              className="select-text italic"
                            >
                              editing...
                            </motion.span>
                          ) : (
                            <>
                              {/* Render text content */}
                              {textContent &&
                                segmentText(textContent).map((segment, idx) => (
                                  <motion.span
                                    key={idx}
                                    initial={
                                      isInitialMessage
                                        ? { opacity: 1, y: 0 }
                                        : { opacity: 0, y: 12 }
                                    }
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`select-text ${
                                      isEmojiOnly(textContent)
                                        ? "text-[24px]"
                                        : ""
                                    } ${
                                      segment.type === "bold"
                                        ? "font-bold"
                                        : segment.type === "italic"
                                        ? "italic"
                                        : ""
                                    }`}
                                    style={{ userSelect: "text" }}
                                    transition={{
                                      duration: 0.15,
                                      delay: idx * 0.05,
                                      ease: "easeOut",
                                      onComplete: () => {
                                        // Play sound on animation complete
                                        if (idx % 2 === 0) {
                                          playNote();
                                        }
                                        // No need for handleAnimationComplete for scrolling
                                      },
                                    }}
                                  >
                                    {segment.content}
                                  </motion.span>
                                ))}

                              {/* Render HTML preview ONLY if needed */}
                              {shouldRenderHtmlPreview && htmlContent && (
                                <HtmlPreview
                                  htmlContent={htmlContent}
                                  onInteractionChange={
                                    setIsInteractingWithPreview
                                  }
                                  isStreaming={
                                    isLoading &&
                                    message === messages[messages.length - 1]
                                  }
                                  playElevatorMusic={playElevatorMusic}
                                  stopElevatorMusic={stopElevatorMusic}
                                  playDingSound={playDingSound}
                                />
                              )}
                            </>
                          )}
                        </motion.div>
                      </motion.div>
                    );
                  })()
                ) : (
                  // User/Human Message Rendering (Keep existing logic)
                  <motion.div
                    layout="position"
                    initial={{
                      backgroundColor:
                        message.role === "user"
                          ? "#fef9c3" // Yellow for user
                          : // For human, use bgColorClass or fallback gray
                          bgColorClass.split(" ")[0].includes("pink")
                          ? "#fce7f3"
                          : bgColorClass.split(" ")[0].includes("purple")
                          ? "#f3e8ff"
                          : bgColorClass.split(" ")[0].includes("indigo")
                          ? "#e0e7ff"
                          : bgColorClass.split(" ")[0].includes("teal")
                          ? "#ccfbf1"
                          : bgColorClass.split(" ")[0].includes("lime")
                          ? "#ecfccb"
                          : bgColorClass.split(" ")[0].includes("amber")
                          ? "#fef3c7"
                          : bgColorClass.split(" ")[0].includes("cyan")
                          ? "#cffafe"
                          : bgColorClass.split(" ")[0].includes("rose")
                          ? "#ffe4e6"
                          : "#f3f4f6", // gray-100 fallback for human if no specific color
                      color: "#000000",
                    }}
                    animate={
                      isUrgentMessage(message.content)
                        ? {
                            backgroundColor: [
                              "#fee2e2", // Start red
                              // Final color based on role (user yellow or human color/gray)
                              message.role === "user"
                                ? "#fef9c3" // Yellow for user
                                : // For human, use bgColorClass or fallback gray
                                bgColorClass.split(" ")[0].includes("pink")
                                ? "#fce7f3"
                                : bgColorClass.split(" ")[0].includes("purple")
                                ? "#f3e8ff"
                                : bgColorClass.split(" ")[0].includes("indigo")
                                ? "#e0e7ff"
                                : bgColorClass.split(" ")[0].includes("teal")
                                ? "#ccfbf1"
                                : bgColorClass.split(" ")[0].includes("lime")
                                ? "#ecfccb"
                                : bgColorClass.split(" ")[0].includes("amber")
                                ? "#fef3c7"
                                : bgColorClass.split(" ")[0].includes("cyan")
                                ? "#cffafe"
                                : bgColorClass.split(" ")[0].includes("rose")
                                ? "#ffe4e6"
                                : "#f3f4f6", // gray-100 fallback for human if no specific color
                            ],
                            color: ["#C92D2D", "#000000"],
                            transition: {
                              duration: 1,
                              repeat: 1,
                              repeatType: "reverse",
                              ease: "easeInOut",
                              delay: 0,
                            },
                          }
                        : {}
                    }
                    className={`${
                      isHtmlCodeBlock(message.content).isHtml
                        ? "w-full p-[1px] m-0 outline-0 ring-0 !bg-transparent"
                        : `w-fit max-w-[90%] p-1.5 px-2 ${
                            bgColorClass ||
                            (message.role === "user"
                              ? "bg-yellow-100 text-black"
                              : "bg-blue-100 text-black")
                          } min-h-[12px] rounded leading-snug text-[12px] font-geneva-12 break-words select-text`
                    }`}
                  >
                    <span
                      className={`select-text whitespace-pre-wrap ${
                        isEmojiOnly(message.content) ? "text-[24px]" : ""
                      }`}
                      style={{ userSelect: "text" }}
                    >
                      {segmentText(message.content).map((segment, idx) => (
                        <span
                          key={idx}
                          className={
                            segment.type === "bold"
                              ? "font-bold"
                              : segment.type === "italic"
                              ? "italic"
                              : ""
                          }
                        >
                          {segment.content}
                        </span>
                      ))}
                    </span>
                    {isHtmlCodeBlock(message.content).isHtml && (
                      <HtmlPreview
                        htmlContent={isHtmlCodeBlock(message.content).content}
                        onInteractionChange={setIsInteractingWithPreview}
                        playElevatorMusic={playElevatorMusic}
                        stopElevatorMusic={stopElevatorMusic}
                        playDingSound={playDingSound}
                      />
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
          {/* Conditionally render Thinking indicator */}
          {(() => {
            const lastMessage = messages[messages.length - 1];
            const isAssistantStreaming =
              isLoading &&
              lastMessage &&
              lastMessage.role === "assistant" &&
              lastMessage.content.length > 0;

            // Show Thinking only if loading is true AND the assistant hasn't started streaming content yet
            if (isLoading && !isAssistantStreaming) {
              return (
                <motion.div
                  layout="position"
                  key="thinking-indicator"
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px] z-1 pl-1"
                  style={{ transformOrigin: "bottom left" }}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking...
                </motion.div>
              );
            }
            return null; // Don't render if not loading or if streaming has started
          })()}
          {error && (
            <motion.div
              layout="position"
              key="error-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-red-600 font-['Geneva-9'] text-[16px] antialiased h-[12px] pl-1"
            >
              <AlertCircle className="h-3 w-3" />
              <span>{error.message}</span>
              {onRetry && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={onRetry}
                  className="m-0 p-0 text-[16px] h-0 text-amber-600"
                >
                  Try again
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </StickToBottom.Content>

      {/* Render the scroll-to-bottom button */}
      <ScrollToBottomButton />
    </StickToBottom>
  );
}
