interface ChatGPTOptions {
	model?: string;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	instructions?: string;
	price?: number;
	max_conversation_tokens?: number;
}

export default ChatGPTOptions;
