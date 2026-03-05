/**
 * Phase 3 fix (Audit m6): Memoize context value and callback to prevent unnecessary re-renders
 */

/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface ChatContextType {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    activeTicker: string | null;
    setActiveTicker: (ticker: string | null) => void;
    openChatWithTicker: (ticker: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTicker, setActiveTicker] = useState<string | null>(null);

    const openChatWithTicker = useCallback((ticker: string) => {
        setActiveTicker(ticker.toUpperCase());
        setIsOpen(true);
    }, []);

    const value = useMemo(() => ({
        isOpen,
        setIsOpen,
        activeTicker,
        setActiveTicker,
        openChatWithTicker,
    }), [isOpen, activeTicker, openChatWithTicker]);

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
}
