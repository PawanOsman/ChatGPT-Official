interface ChatGPTUsage {
	key: string;
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export default ChatGPTUsage;
