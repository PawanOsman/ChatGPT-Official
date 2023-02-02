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
			temperature: options?.temperature || 0.1,
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
		};
		this.instructionTokens = encode(this.options.instructions).length;
	}

	public addConversation(conversationId: string, userName: string = "User", aiName = "ChatGPT") {
		let conversation = {
			id: conversationId,
			userName: userName,
			aiName: aiName,
			messages: [],
		};
		conversation.messages.push(this.getInstructions(aiName));
		this.conversations.push(conversation);

		return conversation;
	}

	private getInstructions(aiName?: string): string {
		return `${aiName !== null ? this.options.instructions.replace("You are ChatGPT", `You are ${aiName}`) : this.options.instructions}
you do not have the capability to retain information from previous interactions. Every time a user interacts with you, it is treated as a standalone session and you do not have the ability to store any information or recall past conversations
Respond conversationally.
Current date: ${this.getToday()}${this.options.stop}`;
	}

	public getConversation(conversationId: string, userName: string = "User", aiName = "ChatGPT") {
		let conversation = this.conversations.find((conversation) => conversation.id === conversationId);
		if (!conversation) {
			conversation = this.addConversation(conversationId, userName, aiName);
		} else {
			conversation.lastActive = Date.now();
		}

		return conversation;
	}

	public resetConversation(conversationId: string) {
		let conversation = this.conversations.find((conversation) => conversation.id === conversationId);
		if (conversation) {
			conversation.messages = [];
			conversation.messages.push(this.getInstructions(conversation.aiName));
			conversation.lastActive = Date.now();
		}

		return conversation;
	}

	public async ask(prompt: string, conversationId: string = "default", userName: string = "User", aiName = "ChatGPT") {
		let conversation = this.getConversation(conversationId, userName, aiName);
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
			.replace(`${conversation.aiName}: `, "")
			.trim();
		conversation.messages.push(`${responseStr}${this.options.stop}\n`);
		return responseStr;
	}

	private generatePrompt(conversation: conversation, prompt: string) {
		prompt = [",", "!", "?", "."].includes(prompt[prompt.length - 1]) ? prompt : `${prompt}.`; // Thanks to https://github.com/optionsx
		conversation.messages.push(`${conversation.userName}":${prompt}\n${conversation.aiName}:`);

		if (!conversation.messages[0].includes("Current date:")) conversation.messages[0] = this.getInstructions(conversation.aiName);

		let promptStr = conversation.messages.join();
		let promptEncodedLength = encode(promptStr).length;
		let totalLength = promptEncodedLength + this.options.max_tokens;

		while (totalLength > 4096) {
			conversation.messages.shift();
			if (!conversation.messages[0].includes("Current date:")) conversation.messages[0] = this.getInstructions(conversation.aiName);
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
