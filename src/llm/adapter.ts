////////////////////////////////////////////////////////////////////////////////

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type LLMStreamOptions = {
  systemPrompt: string;
  history: ChatTurn[];
  userText: string;
  signal: AbortSignal;
  onChunk: (text: string) => void;
};

export type LLMAdapter = {
  id: string;
  label: string;
  stream: (options: LLMStreamOptions) => Promise<void>;
};
