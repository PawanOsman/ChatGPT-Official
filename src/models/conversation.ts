import Message from "./message.js";

interface Conversation {
	id: string;
	messages: Message[];
	userName: string;
	lastActive?: number;
}

export default Conversation;
