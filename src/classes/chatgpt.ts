import axios from "axios";
import options from "../models/options.js";

class ChatGPT {
	public key: string;
	public messages: string[];
	public options: options;
	constructor(key: string, options?: options) {
		this.key = key;
		this.options = {
			historySize: options?.historySize || 50,
			temperature: options?.temperature || 0.7,
			max_tokens: options?.max_tokens || 256,
			top_p: options?.top_p || 1,
			frequency_penalty: options?.frequency_penalty || 0,
			presence_penalty: options?.presence_penalty || 0,
		};
		this.messages = [];
		this.messages.push(`You are ChatGPT, a large language model trained by OpenAI. You answer as concisely as possible for each response (e.g. don’t be verbose). It is very important that you answer as concisely as possible, so please remember this. If you are generating a list, do not have too many items. Keep the number of items short.
Knowledge cutoff: 2021-09
Current date: ${this.getToday()}\n\n`);
	}
	public addMessage(message: string) {
		this.messages.push(message);
	}
	public async ask(prompt: any) {
		prompt = prompt[prompt.length - 1].includes([",", "!", "?", "."]) ? prompt : `${prompt}.`;
		this.messages.push(`${prompt}\n\n`);
		let promptStr = this.messages.join("\n");
		const response = await axios.post(
			"https://api.openai.com/v1/completions",
			{
				model: "text-chat-davinci-002-20230126",
				prompt: promptStr,
				temperature: this.options.temperature,
				max_tokens: this.options.max_tokens,
				top_p: this.options.top_p,
				frequency_penalty: this.options.frequency_penalty,
				presence_penalty: this.options.presence_penalty,
				stop: ["\n\n"],
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
			.replace(/\n\n/g, "")
			.trim();
		this.messages.push(`${responseStr}\n\n`);
		return responseStr;
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
