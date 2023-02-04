import { encode } from "gpt-3-encoder";
import { Configuration, OpenAIApi } from "openai";

import options from "../models/options.js";
import conversation from "../models/conversation.js";

class ChatGPT {
	public key: string;
	public conversations: conversation[];
	public options: options;
	private openAi: OpenAIApi;
	public instructionTokens: number;
	constructor(key: string, options?: options) {
		this.key = key;
		this.conversations = [];
		this.options = {
			model: options?.model || "text-chat-davinci-002-20221122", // default model updated to an older model (2022-11-22) found by @canfam - Discord:pig#8932 // you can use the newest model (2023-01-26) using my private API https://gist.github.com/PawanOsman/be803be44caed2449927860956b240ad
			temperature: options?.temperature || 0.7,
			max_tokens: options?.max_tokens || 1024,
			top_p: options?.top_p || 0.9,
			frequency_penalty: options?.frequency_penalty || 0,
			presence_penalty: options?.presence_penalty || 0,
			instructions:
				options?.instructions ||
				`You are an AI language model developed by OpenAI, called ChatGPT. you have been trained on a large corpus of text data to generate human-like text and answer questions. You answer as concisely as possible for each response (e.g. don’t be verbose). It is very important that you answer as concisely as possible, so please remember this. If you are generating a list, do not have too many items. Keep the number of items short.
Knowledge cutoff: 2021-09
you do not have the capability to retain information from previous interactions. Every time a user interacts with you, it is treated as a standalone session and you do not have the ability to store any information or recall past conversations
Respond conversationally.`,
			stop: options?.stop || "<|im_end|>",
			aiName: options?.aiName || "ChatGPT",
		};
		this.openAi = new OpenAIApi(new Configuration({ apiKey: this.key }));
		this.instructionTokens = encode(this.options.instructions).length;
	}

	public addConversation(conversationId: string, userName: string = "User") {
		let conversation = {
			id: conversationId,
			userName: userName,
			messages: [],
		};
		conversation.messages.push(this.getInstructions());
		this.conversations.push(conversation);

		return conversation;
	}

	private async *chunksToLines(chunksAsync: any) {
		let previous = "";
		for await (const chunk of chunksAsync) {
			const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			previous += bufferChunk;
			let eolIndex;
			while ((eolIndex = previous.indexOf("\n")) >= 0) {
				// line includes the EOL
				const line = previous.slice(0, eolIndex + 1).trimEnd();
				if (line === "data: [DONE]") break;
				if (line.startsWith("data: ")) yield line;
				previous = previous.slice(eolIndex + 1);
			}
		}
	}

	private async *linesToMessages(linesAsync) {
		for await (const line of linesAsync) {
			const message = line.substring("data :".length);

			yield message;
		}
	}

	private async *streamCompletion(data: any) {
		yield* this.linesToMessages(this.chunksToLines(data));
	}

	private getInstructions(): string {
		return `${this.options.instructions.replace("You are ChatGPT", `You are ${this.options.aiName}`)}
you do not have the capability to retain information from previous interactions. Every time a user interacts with you, it is treated as a standalone session and you do not have the ability to store any information or recall past conversations
Respond conversationally.
Current date: ${this.getToday()}${this.options.stop}`;
	}

	public getConversation(conversationId: string, userName: string = "User") {
		let conversation = this.conversations.find((conversation) => conversation.id === conversationId);
		if (!conversation) {
			conversation = this.addConversation(conversationId, userName);
		} else {
			conversation.lastActive = Date.now();
		}

		conversation.userName = userName;

		return conversation;
	}

	public resetConversation(conversationId: string) {
		let conversation = this.conversations.find((conversation) => conversation.id === conversationId);
		if (conversation) {
			conversation.messages = [];
			conversation.messages.push(this.getInstructions());
			conversation.lastActive = Date.now();
		}

		return conversation;
	}

	public async ask(prompt: string, conversationId: string = "default", userName: string = "User") {
		let conversation = this.getConversation(conversationId, userName);
		let promptStr = this.generatePrompt(conversation, prompt);

		try {
			const response = await this.openAi.createCompletion({
				model: this.options.model,
				prompt: promptStr,
				temperature: this.options.temperature,
				max_tokens: this.options.max_tokens,
				top_p: this.options.top_p,
				frequency_penalty: this.options.frequency_penalty,
				presence_penalty: this.options.presence_penalty,
				stop: [this.options.stop],
			});

			let responseStr = response.data.choices[0].text
				.replace(/<\|im_end\|>/g, "")
				.replace(this.options.stop, "")
				.replace(`${this.options.aiName}: `, "")
				.trim();

			conversation.messages.push(`${responseStr}${this.options.stop}\n`);
			return responseStr;
		} catch (error: any) {
			if (error.response?.status) {
				console.error(error.response.status, error.message);
				error.response.data.on("data", (data: any) => {
					const message = data.toString();
					try {
						const parsed = JSON.parse(message);
						console.error("An error occurred during OpenAI request: ", parsed);
					} catch (error) {
						console.error("An error occurred during OpenAI request: ", message);
					}
				});
			} else {
				console.error("An error occurred during OpenAI request", error);
			}
		}
	}

	public async askStream(data: (arg0: string) => void, prompt: string, conversationId: string = "default", userName: string = "User") {
		let conversation = this.getConversation(conversationId, userName);
		let promptStr = this.generatePrompt(conversation, prompt);

		try {
			const response = await this.openAi.createCompletion(
				{
					model: this.options.model,
					prompt: promptStr,
					temperature: this.options.temperature,
					max_tokens: this.options.max_tokens,
					top_p: this.options.top_p,
					frequency_penalty: this.options.frequency_penalty,
					presence_penalty: this.options.presence_penalty,
					stop: [this.options.stop],
					stream: true,
				},
				{ responseType: "stream" },
			);

			let responseStr = "";
			for await (const message of this.streamCompletion(response.data)) {
				try {
					const parsed = JSON.parse(message);
					const { text } = parsed.choices[0];
					responseStr += text;
					data(text);
				} catch (error) {
					console.error("Could not JSON parse stream message", message, error);
				}
			}
			responseStr = responseStr
				.replace(/<\|im_end\|>/g, "")
				.replace(this.options.stop, "")
				.replace(`${this.options.aiName}: `, "")
				.trim();

			conversation.messages.push(`${responseStr}${this.options.stop}\n`);
			return responseStr;
		} catch (error: any) {
			if (error.response?.status) {
				console.error(error.response.status, error.message);
				error.response.data.on("data", (data: any) => {
					const message = data.toString();
					try {
						const parsed = JSON.parse(message);
						console.error("An error occurred during OpenAI request: ", parsed);
					} catch (error) {
						console.error("An error occurred during OpenAI request: ", message);
					}
				});
			} else {
				console.error("An error occurred during OpenAI request", error);
			}
		}
	}

	private generatePrompt(conversation: conversation, prompt: string) {
		prompt = [",", "!", "?", "."].includes(prompt[prompt.length - 1]) ? prompt : `${prompt}.`; // Thanks to https://github.com/optionsx
		conversation.messages.push(`${conversation.userName}":${prompt}\n${this.options.aiName}:`);

		if (!conversation.messages[0].includes("Current date:")) conversation.messages[0] = this.getInstructions();

		let promptStr = conversation.messages.join();
		let promptEncodedLength = encode(promptStr).length;
		let totalLength = promptEncodedLength + this.options.max_tokens;

		while (totalLength > 4096) {
			conversation.messages.shift();
			if (!conversation.messages[0].includes("Current date:")) conversation.messages[0] = this.getInstructions();
			promptStr = conversation.messages.join();
			promptEncodedLength = encode(promptStr).length;
			totalLength = promptEncodedLength + this.options.max_tokens;
		}

		conversation.lastActive = Date.now();
		return promptStr;
	}

	private getToday() {
		let today = new Date();
		let dd = String(today.getDate()).padStart(2, "0");
		let mm = String(today.getMonth() + 1).padStart(2, "0");
		let yyyy = today.getFullYear();
		return `${yyyy}-${mm}-${dd}`;
	}
}

export default ChatGPT;
