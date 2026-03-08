-- Chat conversation history — persists across sessions
CREATE TABLE IF NOT EXISTS chat_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker text NOT NULL DEFAULT 'GLOBAL',
    messages jsonb NOT NULL DEFAULT '[]'::jsonb,
    summary text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by ticker
CREATE INDEX IF NOT EXISTS idx_chat_conversations_ticker ON chat_conversations(ticker);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);

-- RLS policies (anon access like other tables)
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon full access to chat_conversations"
    ON chat_conversations FOR ALL TO anon USING (true) WITH CHECK (true);
