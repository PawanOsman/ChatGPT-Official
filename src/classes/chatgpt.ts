import { encode } from "gpt-3-encoder";
import { Configuration, OpenAIApi } from "openai";
import axios from "axios";

import Options from "../models/options.js";
import Conversation from "../models/conversation.js";
import MessageType from "../enums/message-type.js";

class ChatGPT {
	public key: string;
	public accessToken: string;
	public conversations: Conversation[];
	public options: Options;
	private openAi: OpenAIApi;
	constructor(key: string, options?: Options) {
		this.key = key;
		this.conversations = [];
		this.options = {
			model: options?.model || "text-davinci-003", // default model
			temperature: options?.temperature || 0.7,
			max_tokens: options?.max_tokens || 512,
			top_p: options?.top_p || 0.9,
			frequency_penalty: options?.frequency_penalty || 0,
			presence_penalty: options?.presence_penalty || 0,
			instructions: options?.instructions || `You are ChatGPT, a language model developed by OpenAI. You are designed to respond to user input in a conversational manner, Answer as concisely as possible. Your training data comes from a diverse range of internet text and You have been trained to generate human-like responses to various questions and prompts. You can provide information on a wide range of topics, but your knowledge is limited to what was present in your training data, which has a cutoff date of 2021. You strive to provide accurate and helpful information to the best of your ability.\nKnowledge cutoff: 2021-09`,
			stop: options?.stop || "<|im_end|>",
			aiName: options?.aiName || "ChatGPT",
			moderation: options?.moderation || false,
			revProxy: options?.revProxy,
		};
		this.openAi = new OpenAIApi(new Configuration({ apiKey: this.key }));
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
		return `[START_INSTRUCTIONS]
${this.options.instructions}
Current date: ${this.getToday()}
Current time: ${this.getTime()}${username !== "User" ? `\nName of the user talking to: ${username}` : ""}
[END_INSTRUCTIONS]${this.options.stop}\n`;
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
		if (!this.key.startsWith("sk-")) if (!this.accessToken || !this.validateToken(this.accessToken)) await this.getTokens();
		let conversation = this.getConversation(conversationId, userName);
		let promptStr = this.generatePrompt(conversation, prompt);

		if (this.options.moderation && this.key.startsWith("sk-")) {
			let flagged = await this.moderate(promptStr);
			if (flagged) {
				return "Your message was flagged as inappropriate and was not sent.";
			}
		}

		try {
			let responseStr: string;
			if (!this.options.revProxy) {
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
				responseStr = response.data.choices[0].text;
			} else {
				responseStr = await this.aksRevProxy(promptStr);
			}

			responseStr = responseStr
				.replace(new RegExp(`\n${conversation.userName}:.*`, "gs"), "")
				.replace(new RegExp(`${conversation.userName}:.*`, "gs"), "")
				.replace(/<\|im_end\|>/g, "")
				.replace(this.options.stop, "")
				.replace(`${this.options.aiName}: `, "")
				.trim();

			conversation.messages.push({
				content: responseStr,
				type: MessageType.AI,
				date: Date.now(),
			});

			return responseStr;
		} catch (error: any) {
			throw new Error(error?.response?.data?.error?.message);
		}
	}

	public async askStream(data: (arg0: string) => void, prompt: string, conversationId: string = "default", userName: string = "User") {
		if (!this.key.startsWith("sk-")) if (!this.accessToken || !this.validateToken(this.accessToken)) await this.getTokens();
		let conversation = this.getConversation(conversationId, userName);

		if (this.options.moderation && this.key.startsWith("sk-")) {
			let flagged = await this.moderate(prompt);
			if (flagged) {
				for (let chunk in "Your message was flagged as inappropriate and was not sent.".split("")) {
					data(chunk);
					await this.wait(100);
				}
				return "Your message was flagged as inappropriate and was not sent.";
			}
		}

		let promptStr = this.generatePrompt(conversation, prompt);

		try {
			let responseStr: string = "";
			if (!this.options.revProxy) {
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
			} else {
				responseStr = await this.aksRevProxy(promptStr, data);
			}

			responseStr = responseStr
				.replace(new RegExp(`\n${conversation.userName}:.*`, "gs"), "")
				.replace(new RegExp(`${conversation.userName}:.*`, "gs"), "")
				.replace(/<\|im_end\|>/g, "")
				.replace(this.options.stop, "")
				.replace(`${this.options.aiName}: `, "")
				.trim();

			conversation.messages.push({
				content: responseStr,
				type: MessageType.AI,
				date: Date.now(),
			});

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

	private async aksRevProxy(prompt: string, data: (arg0: string) => void = (_) => {}) {
		if (!this.key.startsWith("sk-")) if (!this.accessToken || !this.validateToken(this.accessToken)) await this.getTokens();
		try {
			const response = await axios.post(
				this.options.revProxy,
				{
					model: this.options.model,
					prompt: prompt,
					temperature: this.options.temperature,
					max_tokens: this.options.max_tokens,
					top_p: this.options.top_p,
					frequency_penalty: this.options.frequency_penalty,
					presence_penalty: this.options.presence_penalty,
					stop: [this.options.stop],
					stream: true,
				},
				{
					responseType: "stream",
					headers: {
						Accept: "text/event-stream",
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.key.startsWith("sk-") ? this.key : this.accessToken}`,
					},
				},
			);

			let responseStr = "";

			response.data.on("data", (chunk: string) => {
				responseStr += chunk;
				data(chunk);
			});

			await new Promise((resolve) => response.data.on("end", resolve));

			return responseStr;
		} catch (error: any) {
			throw new Error(error?.response?.data?.error?.message);
		}
	}

	private generatePrompt(conversation: Conversation, prompt: string) {
		prompt = [",", "!", "?", "."].includes(prompt[prompt.length - 1]) ? prompt : `${prompt}.`; // Thanks to https://github.com/optionsx

		conversation.messages.push({
			content: prompt,
			type: MessageType.User,
			date: Date.now(),
		});

		let promptStr = this.convToString(conversation);
		let promptEncodedLength = encode(promptStr).length;
		let totalLength = promptEncodedLength + this.options.max_tokens;

		while (totalLength > 4096) {
			conversation.messages.shift();
			promptStr = this.convToString(conversation);
			promptEncodedLength = encode(promptStr).length;
			totalLength = promptEncodedLength + this.options.max_tokens;
		}

		conversation.lastActive = Date.now();
		return promptStr;
	}

	public async moderate(prompt: string) {
		let response = await this.openAi.createModeration({
			input: prompt,
		});
		return response.data.results[0].flagged;
	}

	private convToString(conversation: Conversation) {
		let messages: string[] = [];
		for (let i = 0; i < conversation.messages.length; i++) {
			let message = conversation.messages[i];
			if (i === 0) {
				messages.push(this.getInstructions(conversation.userName));
			}
			messages.push(`${message.type === MessageType.User ? conversation.userName : this.options.aiName}: ${conversation.messages[i].content}${this.options.stop}`);
		}
		messages.push(`${this.options.aiName}: `);
		let result = messages.join("\n");
		return result;
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

	private wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private validateToken(token: string) {
		if (!token) return false;
		const parsed = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());

		return Date.now() <= parsed.exp * 1000;
	}

	async getTokens() {
		if (!this.key) {
			throw new Error("No session token provided");
		}

		const response = await axios.request({
			method: "GET",
			url: Buffer.from("aHR0cHM6Ly9leHBsb3Jlci5hcGkub3BlbmFpLmNvbS9hcGkvYXV0aC9zZXNzaW9u", "base64").toString("ascii"),
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0",
				Cookie: `__Secure-next-auth.session-token=${this.key}`,
			},
		});

		try {
			const cookies = response.headers["set-cookie"];
			const sessionCookie = cookies.find((cookie) => cookie.startsWith("__Secure-next-auth.session-token"));

			this.key = sessionCookie.split("=")[1];
			this.accessToken = response.data.accessToken;
		} catch (err) {
			throw new Error(`Failed to fetch new session tokens due to: ${err}`);
		}
	}
}

export default ChatGPT;
