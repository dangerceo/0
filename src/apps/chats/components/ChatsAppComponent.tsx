import { useState, useCallback } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ChatsMenuBar } from "./ChatsMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { helpItems, appMetadata } from "..";
import { useChatRoom } from "../hooks/useChatRoom";
import { useAiChat } from "../hooks/useAiChat";
import React from "react";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { ChatRoomSidebar } from "./ChatRoomSidebar";
import { useChatsStore } from "@/stores/useChatsStore";
import { type Message as UIMessage } from "ai/react";
import { type ChatMessage as AppChatMessage, type ChatRoom } from "@/types/chat";
import { Button } from "@/components/ui/button";

// Define the expected message structure locally, matching ChatMessages internal type
interface DisplayMessage extends Omit<UIMessage, 'role'> {
  username?: string;
  role: UIMessage['role'] | 'human';
  createdAt?: Date; // Ensure createdAt is optional Date
}

// Memoized versions to prevent unnecessary re-renders while streaming
const MemoChatMessages = React.memo(ChatMessages);
const MemoChatInput = React.memo(ChatInput);
const MemoChatRoomSidebar = React.memo(ChatRoomSidebar);

export function ChatsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
}: AppProps) {
  const { aiMessages } = useChatsStore();
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: handleAiSubmit,
    isLoading,
    reload,
    error,
    stop,
    handleDirectMessageSubmit,
    handleNudge,
    handleSaveTranscript,
    isClearDialogOpen,
    setIsClearDialogOpen,
    confirmClearChats,
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    saveFileName,
    setSaveFileName,
    handleSaveSubmit,
  } = useAiChat();

  const {
    username,
    rooms,
    currentRoomId,
    currentRoomMessages,
    isSidebarVisible,
    isAdmin,
    handleRoomSelect,
    sendRoomMessage,
    toggleSidebarVisibility,
    promptSetUsername,
    promptAddRoom,
    promptDeleteRoom,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    setUsernameError,
    isNewRoomDialogOpen,
    setIsNewRoomDialogOpen,
    newRoomName,
    setNewRoomName,
    isCreatingRoom,
    roomError,
    submitNewRoomDialog,
    isDeleteRoomDialogOpen,
    setIsDeleteRoomDialogOpen,
    roomToDelete,
    confirmDeleteRoom,
  } = useChatRoom(isWindowOpen ?? false, isForeground ?? false);

  const [isShaking, setIsShaking] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  // Add safety check: ensure rooms is an array before finding
  const currentRoom = Array.isArray(rooms) && currentRoomId
    ? rooms.find((r: ChatRoom) => r.id === currentRoomId)
    : null;

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (currentRoomId && username) {
        sendRoomMessage(input);
        handleInputChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
      } else {
        handleAiSubmit(e);
      }
    },
    [currentRoomId, username, sendRoomMessage, handleAiSubmit, input, handleInputChange]
  );

  const handleDirectSubmit = useCallback(
    (message: string) => {
      if (currentRoomId && username) {
        sendRoomMessage(message);
      } else {
        handleDirectMessageSubmit(message);
      }
    },
    [currentRoomId, username, sendRoomMessage, handleDirectMessageSubmit]
  );

  const handleNudgeClick = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 400);
    handleNudge();
  }, [handleNudge]);

  if (!isWindowOpen) return null;

  // Explicitly type the array using the local DisplayMessage interface
  const currentMessagesToDisplay: DisplayMessage[] = currentRoomId
    ? currentRoomMessages.map((msg: AppChatMessage) => ({ // Use AppChatMessage here
        id: msg.id,
        role: msg.username === username ? 'user' : 'human',
        content: msg.content,
        createdAt: new Date(msg.timestamp), // Ensure this is a Date object
        username: msg.username,
      }))
    : messages.map((msg: UIMessage) => ({
        ...msg,
        // Ensure createdAt is a Date object if it exists, otherwise undefined
        createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
        username: msg.role === 'user' ? (username || 'You') : 'Ryo'
      }));

  // Ensure isSidebarVisible is always boolean for child components
  const sidebarVisibleBool = isSidebarVisible ?? false;

  return (
    <>
      <ChatsMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        onClearChats={() => setIsClearDialogOpen(true)}
        onSaveTranscript={handleSaveTranscript}
        onSetUsername={promptSetUsername}
        onToggleSidebar={toggleSidebarVisibility}
        isSidebarVisible={sidebarVisibleBool} // Pass boolean
        onAddRoom={promptAddRoom}
        rooms={rooms}
        currentRoom={currentRoom ?? null}
        onRoomSelect={(room) => handleRoomSelect(room ? room.id : null)}
        isAdmin={isAdmin}
      />
      <WindowFrame
        title={currentRoom ? `#${currentRoom.name}` : "@ryo"}
        onClose={onClose}
        isForeground={isForeground}
        appId="chats"
        skipInitialSound={skipInitialSound}
        isShaking={isShaking}
      >
        <div className="flex flex-col md:flex-row h-full bg-[#c0c0c0] w-full">
          <MemoChatRoomSidebar
            rooms={rooms}
            currentRoom={currentRoom ?? null}
            onRoomSelect={(room) => handleRoomSelect(room ? room.id : null)}
            onAddRoom={promptAddRoom}
            onDeleteRoom={(room) => promptDeleteRoom(room)}
            isVisible={sidebarVisibleBool} // Pass boolean
            isAdmin={isAdmin}
          />
          <div className="flex flex-col flex-1 p-2 overflow-hidden">
            {/* Chat Messages Area - takes up remaining space */}
            <div className="flex-1 overflow-hidden">
              <MemoChatMessages
                key={currentRoomId || 'ryo'} // Re-render on room change
                messages={currentMessagesToDisplay} // Remove 'as any'
                isLoading={isLoading && !currentRoomId} // Only show AI loading state
                error={!currentRoomId ? error : undefined} // Pass actual error object only for AI chat
                onRetry={reload}
                onClear={() => setIsClearDialogOpen(true)} // AI Clear only
                isRoomView={!!currentRoomId}
                roomId={currentRoomId ?? undefined}
                isAdmin={isAdmin}
                username={username || undefined} // Pass username for message deletion check
              />
            </div>

            {/* Input Area or Set Username Prompt */}
            <div className="flex-shrink-0 pt-2">
              {currentRoomId && !username ? (
                  <Button onClick={promptSetUsername} className="w-full h-8 font-geneva-12 text-[12px] bg-orange-600 text-white hover:bg-orange-700 transition-all duration-200">
                    Set Username to Chat
                  </Button>
              ) : (
                // AI Chat or in a room with username set
                (() => {
                  const userMessages = aiMessages.filter((msg: UIMessage) => msg.role === "user");
                  const prevMessagesContent = Array.from(new Set(userMessages.map((msg) => msg.content))).reverse() as string[];

                  return (
                    <MemoChatInput
                      input={input}
                      isLoading={isLoading}
                      isForeground={isForeground}
                      onInputChange={handleInputChange}
                      onSubmit={handleSubmit}
                      onStop={stop}
                      onDirectMessageSubmit={handleDirectSubmit}
                      onNudge={handleNudgeClick}
                      previousMessages={prevMessagesContent}
                      showNudgeButton={!currentRoomId} // Only show nudge for AI chat
                    />
                  );
                })()
              )}
            </div>
          </div>
        </div>
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={helpItems}
          appName="Chats"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isClearDialogOpen}
          onOpenChange={setIsClearDialogOpen}
          onConfirm={confirmClearChats}
          title="Clear Chats"
          description="Are you sure you want to clear all AI chats? This action cannot be undone."
        />
        <InputDialog
          isOpen={isSaveDialogOpen}
          onOpenChange={setIsSaveDialogOpen}
          onSubmit={handleSaveSubmit}
          title="Save Transcript"
          description="Enter a name for your AI chat transcript file"
          value={saveFileName}
          onChange={setSaveFileName}
        />
        <InputDialog
          isOpen={isUsernameDialogOpen}
          onOpenChange={(open) => {
              console.log(`[ChatApp Debug] Username InputDialog onOpenChange called with: ${open}`);
              setIsUsernameDialogOpen(open);
          }}
          onSubmit={submitUsernameDialog}
          title="Set Username"
          description="Enter the username you want to use in Chat Rooms"
          value={newUsername}
          onChange={(value) => { 
            setNewUsername(value); 
            setUsernameError(null);
          }}
          isLoading={isSettingUsername}
          errorMessage={usernameError}
        />
        <InputDialog
          isOpen={isNewRoomDialogOpen}
          onOpenChange={setIsNewRoomDialogOpen}
          onSubmit={submitNewRoomDialog}
          title="Create New Room"
          description="Enter a name for the new chat room"
          value={newRoomName}
          onChange={(value) => { setNewRoomName(value); }}
          isLoading={isCreatingRoom}
          errorMessage={roomError}
        />
        <ConfirmDialog
          isOpen={isDeleteRoomDialogOpen}
          onOpenChange={setIsDeleteRoomDialogOpen}
          onConfirm={confirmDeleteRoom}
          title="Delete Chat Room"
          description={`Are you sure you want to delete the room "${roomToDelete?.name}"?. This action cannot be undone.`}
        />
      </WindowFrame>
    </>
  );
}
