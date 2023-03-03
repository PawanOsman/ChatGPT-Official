import { encode } from "gpt-3-encoder";
import axios from "axios";
import Usage from "../models/chatgpt-usage.js";
import Options from "../models/chatgpt-options.js";
import Conversation from "../models/conversation.js";
import Message from "../models/chatgpt-message.js";
import MessageType from "../enums/message-type.js";
import AppDbContext from "./app-dbcontext.js";
import OpenAIKey from "../models/openai-key.js";

class ChatGPT {
	public conversations: Conversation[];
	public options: Options;
	private db: AppDbContext;
	public onUsage: (usage: Usage) => void;

	constructor(key: string | string[], options?: Options) {
		this.conversations = [];
		this.db = new AppDbContext();
		this.db.WaitForLoad().then(() => {
			if (typeof key === "string") {
				if (this.db.keys.Any((x) => x.key === key)) return;
				this.db.keys.Add({
					key: key,
					queries: 0,
					balance: 0,
					tokens: 0,
				});
			} else {
				key.forEach((k) => {
					if (this.db.keys.Any((x) => x.key === k)) return;
					this.db.keys.Add({
						key: k,
						queries: 0,
						balance: 0,
						tokens: 0,
					});
				});
			}
		});
		this.options = {
			model: options?.model || "gpt-3.5-turbo", // default model
			temperature: options?.temperature || 0.7,
			max_tokens: options?.max_tokens || 100,
			top_p: options?.top_p || 0.9,
			frequency_penalty: options?.frequency_penalty || 0,
			presence_penalty: options?.presence_penalty || 0,
			instructions: options?.instructions || `You are ChatGPT, a language model developed by OpenAI. You are designed to respond to user input in a conversational manner, Answer as concisely as possible. Your training data comes from a diverse range of internet text and You have been trained to generate human-like responses to various questions and prompts. You can provide information on a wide range of topics, but your knowledge is limited to what was present in your training data, which has a cutoff date of 2021. You strive to provide accurate and helpful information to the best of your ability.\nKnowledge cutoff: 2021-09`,
			price: options?.price || 0.002,
			max_conversation_tokens: options?.max_conversation_tokens || 4097,
		};
	}

	private getOpenAIKey(): OpenAIKey {
		let key = this.db.keys.OrderBy((x) => x.balance).FirstOrDefault();

		if (key == null) {
			key = this.db.keys.FirstOrDefault();
		}

		if (key == null) {
			throw new Error("No keys available.");
		}

		return key;
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

	private async *linesToMessages(linesAsync: any) {
		for await (const line of linesAsync) {
			const message = line.substring("data :".length);

			yield message;
		}
	}

	private async *streamCompletion(data: any) {
		yield* this.linesToMessages(this.chunksToLines(data));
	}

	private getInstructions(username: string): string {
		return `${this.options.instructions}
Current date: ${this.getToday()}
Current time: ${this.getTime()}${username !== "User" ? `\nName of the user talking to: ${username}` : ""}`;
	}

	public addConversation(conversationId: string, userName: string = "User") {
		let conversation: Conversation = {
			id: conversationId,
			userName: userName,
			messages: [],
		};
		this.conversations.push(conversation);

		return conversation;
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
			conversation.lastActive = Date.now();
		}

		return conversation;
	}

	public async ask(prompt: string, conversationId: string = "default", userName: string = "User") {
		return await this.askStream(
			(data) => {},
			(data) => {},
			prompt,
			conversationId,
			userName,
		);
	}

	public async askStream(data: (arg0: string) => void, usage: (usage: Usage) => void, prompt: string, conversationId: string = "default", userName: string = "User") {
		let oAIKey = this.getOpenAIKey();
		let conversation = this.getConversation(conversationId, userName);
		let promptStr = this.generatePrompt(conversation, prompt);
		let prompt_tokens = this.countTokens(promptStr);
		try {
			const response = await axios.post(
				`https://api.openai.com/v1/chat/completions`,
				{
					model: this.options.model,
					messages: promptStr,
					temperature: this.options.temperature,
					max_tokens: this.options.max_tokens,
					top_p: this.options.top_p,
					frequency_penalty: this.options.frequency_penalty,
					presence_penalty: this.options.presence_penalty,
					stream: true,
				},
				{
					responseType: "stream",
					headers: {
						Accept: "text/event-stream",
						"Content-Type": "application/json",
						Authorization: `Bearer ${oAIKey.key}`,
					},
				},
			);

			let responseStr = "";

			for await (const message of this.streamCompletion(response.data)) {
				try {
					const parsed = JSON.parse(message);
					const { content } = parsed.choices[0].delta;
					if (content) {
						responseStr += content;
						data(content);
					}
				} catch (error) {
					console.error("Could not JSON parse stream message", message, error);
				}
			}

			let completion_tokens = encode(responseStr).length;

			let usageData = {
				key: oAIKey.key,
				prompt_tokens: prompt_tokens,
				completion_tokens: completion_tokens,
				total_tokens: prompt_tokens + completion_tokens,
			};

			usage(usageData);
			if (this.onUsage) this.onUsage(usageData);

			oAIKey.tokens += usageData.total_tokens;
			oAIKey.balance = (usageData.total_tokens / 1000) * this.options.price;
			oAIKey.queries++;

			return responseStr;
		} catch (error: any) {
			if (error.response && error.response.data && error.response.headers["content-type"] === "application/json") {
				let errorResponseStr = "";

				for await (const message of error.response.data) {
					errorResponseStr += message;
				}

				const errorResponseJson = JSON.parse(errorResponseStr);
				throw new Error(errorResponseJson.error.message);
			} else {
				throw new Error(error.message);
			}
		}
	}

	private generatePrompt(conversation: Conversation, prompt: string): Message[] {
		conversation.messages.push({
			content: prompt,
			type: MessageType.User,
			date: Date.now(),
		});

		let messages = this.generateMessages(conversation);
		let promptEncodedLength = this.countTokens(messages);
		let totalLength = promptEncodedLength + this.options.max_tokens;

		while (totalLength > this.options.max_conversation_tokens) {
			conversation.messages.shift();
			messages = this.generateMessages(conversation);
			promptEncodedLength = this.countTokens(messages);
			totalLength = promptEncodedLength + this.options.max_tokens;
		}

		conversation.lastActive = Date.now();
		return messages;
	}

	private generateMessages(conversation: Conversation): Message[] {
		let messages: Message[] = [];
		messages.push({
			role: "system",
			content: this.getInstructions(conversation.userName),
		});
		for (let i = 0; i < conversation.messages.length; i++) {
			let message = conversation.messages[i];
			messages.push({
				role: message.type === MessageType.User ? "user" : "assistant",
				content: message.content,
			});
		}
		return messages;
	}

	private countTokens(messages: Message[]): number {
		let tokens: number = 0;
		for (let i = 0; i < messages.length; i++) {
			let message = messages[i];
			tokens += encode(message.content).length;
		}
		return tokens;
	}

	private getToday() {
		let today = new Date();
		let dd = String(today.getDate()).padStart(2, "0");
		let mm = String(today.getMonth() + 1).padStart(2, "0");
		let yyyy = today.getFullYear();
		return `${yyyy}-${mm}-${dd}`;
	}

	private getTime() {
		let today = new Date();
		let hours: any = today.getHours();
		let minutes: any = today.getMinutes();
		let ampm = hours >= 12 ? "PM" : "AM";
		hours = hours % 12;
		hours = hours ? hours : 12;
		minutes = minutes < 10 ? `0${minutes}` : minutes;
		return `${hours}:${minutes} ${ampm}`;
	}
}

export default ChatGPT;
