import axios from "axios";

class ChatGPT {
    public key: string;
    public messages: string[];
    constructor(key: string) {
        this.key = key;
        this.messages = [];
        this.messages.push(`You are ChatGPT, a large language model trained by OpenAI. You answer as concisely as possible for each response (e.g. don’t be verbose). It is very important that you answer as concisely as possible, so please remember this. If you are generating a list, do not have too many items. Keep the number of items short.
Knowledge cutoff: 2021-09
Current date: ${this.getToday()}`);
    }
    public addMessage(message: string) {
        this.messages.push(message);
    }
    public async ask(prompt: any) {
        this.messages.push(prompt);
        let promptStr = this.messages.join("\n");
        const response = await axios.post(
          'https://api.openai.com/v1/completions',
          {
            'model': 'text-chat-davinci-002-20230126',
            'prompt': promptStr,
            'temperature': 1.0,
            'max_tokens': 256,
            'top_p': 1,
            'frequency_penalty': 0,
            'presence_penalty': 0.6,
            'stop': ["<|im_end|>"]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.key}`
            }
          }
        );

        let responseStr = response.data.choices[0].text.replace(/<|im_end|>/g, '').trim()
        this.messages.push(responseStr);
        return responseStr;
    }

    private getToday() {
        let today = new Date();
        let dd = String(today.getDate()).padStart(2, '0');
        let mm = String(today.getMonth() + 1).padStart(2, '0');
        let yyyy = today.getFullYear();
        return `${yyyy}-${mm}-${dd}`;
    }
}

export default ChatGPT;