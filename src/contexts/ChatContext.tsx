import { createContext, useContext, useState, ReactNode } from 'react';

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

    const openChatWithTicker = (ticker: string) => {
        setActiveTicker(ticker.toUpperCase());
        setIsOpen(true);
    };

    return (
        <ChatContext.Provider
            value={{
                isOpen,
                setIsOpen,
                activeTicker,
                setActiveTicker,
                openChatWithTicker
            }}
        >
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
