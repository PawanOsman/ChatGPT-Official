import axios from "axios";
import { encode } from "gpt-3-encoder";

import options from "../models/options.js";
import conversation from "../models/conversation.js";

class ChatGPT {
	public key: string;
	public conversations: conversation[];
	public options: options;
	public instructionTokens: number;
	constructor(key: string, options?: options) {
		this.key = key;
		this.conversations = [];
		this.options = {
			model: options?.model || "text-chat-davinci-002-20230126",
			temperature: options?.temperature || 0.7,
			max_tokens: options?.max_tokens || 256,
			top_p: options?.top_p || 1,
			frequency_penalty: options?.frequency_penalty || 0,
			presence_penalty: options?.presence_penalty || 0,
			instructions:
				options?.instructions ||
				`You are ChatGPT, a large language model trained by OpenAI. You answer as concisely as possible for each response (e.g. don’t be verbose). It is very important that you answer as concisely as possible, so please remember this. If you are generating a list, do not have too many items. Keep the number of items short.
Knowledge cutoff: 2021-09`,
			stop: options?.stop || "<|im_end|>",
		};
		this.instructionTokens = encode(this.options.instructions).length;
	}

	public addConversation(conversationId: string) {
		let conversation = {
			id: conversationId,
			messages: [],
		};
		conversation.messages.push(`${this.options.instructions}
Current date: ${this.getToday()}${this.options.stop}`);
		this.conversations.push(conversation);

		return conversation;
	}

	public getConversation(conversationId: string) {
		let conversation = this.conversations.find((conversation) => conversation.id === conversationId);
		if (!conversation) {
			conversation = this.addConversation(conversationId);
		} else {
			conversation.lastActive = Date.now();
		}

		return conversation;
	}

	public resetConversation(conversationId: string) {
		let conversation = this.conversations.find((conversation) => conversation.id === conversationId);
		if (conversation) {
			conversation.messages = [];
			conversation.messages.push(`${this.options.instructions}
Current date: ${this.getToday()}${this.options.stop}`);
			conversation.lastActive = Date.now();
		}

		return conversation;
	}

	public async ask(prompt: string, conversationId: string = "default") {
		let conversation = this.getConversation(conversationId);
		let promptStr = this.generatePrompt(conversation, prompt);

		const response = await axios.post(
			"https://api.openai.com/v1/completions",
			{
				model: this.options.model,
				prompt: promptStr,
				temperature: this.options.temperature,
				max_tokens: this.options.max_tokens,
				top_p: this.options.top_p,
				frequency_penalty: this.options.frequency_penalty,
				presence_penalty: this.options.presence_penalty,
				stop: [this.options.stop],
			},
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.key}`,
				},
			},
		);

		let responseStr = response.data.choices[0].text
			.replace(/<\|im_end\|>/g, "")
			.replace(this.options.stop, "")
			.trim();
		conversation.messages.push(`${responseStr}${this.options.stop}`);
		return responseStr;
	}

	private generatePrompt(conversation: conversation, prompt: string) {
		prompt = [",", "!", "?", "."].includes(prompt[prompt.length - 1]) ? prompt : `${prompt}.`; // Thanks to https://github.com/optionsx
		conversation.messages.push(`${prompt}\n\n`);

		if (!conversation.messages[0].includes("Current date:"))
			conversation.messages[0] = `${this.options.instructions}
Current date: ${this.getToday()}${this.options.stop}`;

		let promptStr = conversation.messages.join("\n");
		let promptEncodedLength = encode(promptStr).length;
		let totalLength = promptEncodedLength + this.options.max_tokens;

		while (totalLength > 4096) {
			conversation.messages.shift();
			if (!conversation.messages[0].includes("Current date:"))
				conversation.messages[0] = `${this.options.instructions}
Current date: ${this.getToday()}${this.options.stop}`;
			promptStr = conversation.messages.join("\n");
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
